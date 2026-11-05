import type postgres from "postgres";
import { countsOf, persistResult, upsertSources } from "@/db/persist";
import { makeContext } from "@/lib/http";
import type { Connector } from "@/lib/types";
import { connectors } from "@/connectors";
import { applyCatalog, loadCatalog } from "./catalog";

const PER_SOURCE_TIMEOUT_MS = 45_000;
const CONCURRENCY = 12;

export interface RunSummary {
  ran: number;
  ok: number;
  failed: { id: string; error: string }[];
  skipped: number;
  durationMs: number;
}

/**
 * Atomically claim the sources that are due. A source is due when its interval has elapsed since the last
 * run, with exponential backoff after consecutive failures (capped at 60 minutes).
 */
async function claimDue(sql: postgres.Sql, ids: string[], limit: number): Promise<string[]> {
  const rows = await sql`
    UPDATE sources s SET last_run_at = now()
    FROM (
      SELECT id FROM sources
      WHERE enabled AND id = ANY(${ids})
        AND (kind <> 'schedule' OR EXISTS (SELECT 1 FROM static_imports i WHERE i.source_id = sources.id AND i.ok))
        AND (last_run_at IS NULL OR last_run_at <= now() - make_interval(
              mins => LEAST(60, interval_minutes * power(2, LEAST(consecutive_failures, 6))::int)) + interval '5 seconds')
      ORDER BY last_run_at NULLS FIRST
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    ) due
    WHERE s.id = due.id
    RETURNING s.id`;
  return rows.map((r) => r.id as string);
}

async function runOne(sql: postgres.Sql, c: Connector, deadline: number): Promise<{ ok: boolean; error?: string }> {
  const started = new Date();
  const budget = Math.max(5_000, Math.min(PER_SOURCE_TIMEOUT_MS, deadline - Date.now()));
  const signal = AbortSignal.timeout(budget);
  try {
    const [raw, catalog] = await Promise.race([
      Promise.all([c.fetch(makeContext(signal, started)), loadCatalog(sql, c.meta.id)]),
      new Promise<never>((_, rej) => signal.addEventListener("abort", () => rej(new Error(`timeout after ${budget}ms`)))),
    ]);
    const result = applyCatalog(raw, catalog, { schedule: c.meta.kind === "schedule" });
    const counts = countsOf(result);
    if (Object.keys(result).length === 0)
      throw new Error(c.meta.kind === "schedule" ? "timetable not imported yet" : "connector returned no data");
    await persistResult(sql, c.meta.id, result);
    const ms = Date.now() - started.getTime();
    await sql`
      UPDATE sources SET last_success_at = now(), last_error = NULL, consecutive_failures = 0,
        last_counts = ${sql.json(counts)}, last_duration_ms = ${ms}
      WHERE id = ${c.meta.id}`;
    await sql`INSERT INTO ingest_runs (source_id, started_at, duration_ms, ok, counts)
              VALUES (${c.meta.id}, ${started}, ${ms}, true, ${sql.json(counts)})`;
    return { ok: true };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    const ms = Date.now() - started.getTime();
    await sql`
      UPDATE sources SET last_error = ${error}, consecutive_failures = consecutive_failures + 1,
        last_duration_ms = ${ms}
      WHERE id = ${c.meta.id}`;
    await sql`INSERT INTO ingest_runs (source_id, started_at, duration_ms, ok, error)
              VALUES (${c.meta.id}, ${started}, ${ms}, false, ${error})`;
    return { ok: false, error };
  }
}

export async function runDue(
  sql: postgres.Sql,
  opts: { budgetMs?: number; only?: string[]; force?: boolean } = {},
): Promise<RunSummary> {
  const t0 = Date.now();
  const deadline = t0 + (opts.budgetMs ?? 240_000);
  const pool = opts.only ? connectors.filter((c) => opts.only!.includes(c.meta.id)) : connectors;
  await upsertSources(sql, pool.map((c) => c.meta));
  if (opts.force) {
    await sql`UPDATE sources SET last_run_at = NULL WHERE id = ANY(${pool.map((c) => c.meta.id)})`;
  }
  const byId = new Map(pool.map((c) => [c.meta.id, c]));
  const summary: RunSummary = { ran: 0, ok: 0, failed: [], skipped: 0, durationMs: 0 };

  const queue = await claimDue(sql, [...byId.keys()], 1000);
  summary.skipped = pool.length - queue.length;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && Date.now() < deadline - 5_000) {
      const id = queue.shift()!;
      const r = await runOne(sql, byId.get(id)!, deadline);
      summary.ran++;
      if (r.ok) summary.ok++;
      else summary.failed.push({ id, error: r.error! });
    }
  });
  await Promise.all(workers);
  if (queue.length) {
    // Out of time: release the unclaimed ones so the next tick picks them up first.
    await sql`UPDATE sources SET last_run_at = NULL WHERE id = ANY(${queue})`;
  }
  summary.durationMs = Date.now() - t0;
  return summary;
}

export async function prune(sql: postgres.Sql) {
  await sql`DELETE FROM ingest_runs WHERE started_at < now() - interval '2 days' OR (ok AND started_at < now() - interval '2 hours')`;
  await sql`DELETE FROM status_events WHERE at < now() - interval '90 days'`;
  await sql`DELETE FROM alerts WHERE NOT active AND resolved_at < now() - interval '90 days'`;
  await sql`DELETE FROM departures WHERE scheduled_at < now() - interval '12 hours'`;
  await sql`DELETE FROM vehicles v USING sources s WHERE v.source_id = s.id AND s.last_success_at < now() - interval '30 minutes'`;
  await sql`DELETE FROM sources WHERE id <> ALL(${connectors.map((c) => c.meta.id)})`;
}
