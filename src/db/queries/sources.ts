import { db } from "../client";
import { HEALTH_SQL, iso, type Health } from "./common";
import { mapAlert } from "./alerts";
import { mapLine, mapStation } from "./network";

export interface SourceSummary {
  id: string;
  name: string;
  operator: string;
  country: string;
  city: string | null;
  region: string;
  modes: string[];
  kind: string;
  homepage: string;
  license: string | null;
  attribution: string | null;
  intervalMinutes: number;
  lat: number | null;
  lon: number | null;
  health: Health;
  lastSuccessAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  counts: Record<string, number>;
  activeAlerts: number;
  disruptedLines: number;
}

type Row = Record<string, unknown>;

export function mapSource(r: Row): SourceSummary {
  return {
    id: r.id as string,
    name: r.name as string,
    operator: r.operator as string,
    country: r.country as string,
    city: (r.city as string) ?? null,
    region: r.region as string,
    modes: r.modes as string[],
    kind: r.kind as string,
    homepage: r.homepage as string,
    license: (r.license as string) ?? null,
    attribution: (r.attribution as string) ?? null,
    intervalMinutes: r.interval_minutes as number,
    lat: (r.lat as number) ?? null,
    lon: (r.lon as number) ?? null,
    health: r.health as Health,
    lastSuccessAt: iso(r.last_success_at),
    lastRunAt: iso(r.last_run_at),
    lastError: (r.last_error as string) ?? null,
    counts: (r.last_counts as Record<string, number>) ?? {},
    activeAlerts: Number(r.active_alerts ?? 0),
    disruptedLines: Number(r.disrupted_lines ?? 0),
  };
}

const SOURCE_SELECT = `
  SELECT s.*, ${HEALTH_SQL} AS health,
    (SELECT count(*) FROM alerts a WHERE a.source_id = s.id AND a.active) AS active_alerts,
    (SELECT count(*) FROM line_status l WHERE l.source_id = s.id AND l.status NOT IN ('good','unknown')) AS disrupted_lines
  FROM sources s`;

export interface SourceFilter {
  country?: string;
  mode?: string;
  region?: string;
  q?: string;
  health?: Health;
}

export async function listSources(f: SourceFilter = {}): Promise<SourceSummary[]> {
  const sql = db();
  const rows = await sql.unsafe(
    `SELECT * FROM (${SOURCE_SELECT} WHERE s.enabled) x
     WHERE ($1::text IS NULL OR country = $1)
       AND ($2::text IS NULL OR $2 = ANY(modes))
       AND ($3::text IS NULL OR region = $3)
       AND ($4::text IS NULL OR (name || ' ' || operator || ' ' || coalesce(city,'')) ILIKE '%' || $4 || '%')
       AND ($5::text IS NULL OR health = $5)
     ORDER BY country, coalesce(city, ''), name`,
    [f.country?.toLowerCase() ?? null, f.mode ?? null, f.region ?? null, f.q ?? null, f.health ?? null],
  );
  return rows.map(mapSource);
}

export async function getSource(id: string) {
  const sql = db();
  const [row] = await sql.unsafe(`${SOURCE_SELECT} WHERE s.id = $1`, [id]);
  if (!row) return null;
  const [lines, alerts, stations, runs] = await Promise.all([
    sql`SELECT * FROM line_status WHERE source_id = ${id} ORDER BY line_name`,
    sql`SELECT a.*, s.name AS source_name, s.country, s.city FROM alerts a JOIN sources s ON s.id = a.source_id
        WHERE a.source_id = ${id} AND a.active ORDER BY a.last_seen_at DESC LIMIT 200`,
    sql`SELECT st.*, s.name AS source_name FROM stations st JOIN sources s ON s.id = st.source_id
        WHERE st.source_id = ${id} ORDER BY st.name LIMIT 500`,
    sql`SELECT started_at, duration_ms, ok, error, counts FROM ingest_runs
        WHERE source_id = ${id} ORDER BY started_at DESC LIMIT 30`,
  ]);
  return {
    ...mapSource(row),
    endpoints: row.endpoints as string[],
    lines: lines.map(mapLine),
    alerts: alerts.map(mapAlert),
    stations: stations.map(mapStation),
    recentRuns: runs.map((r) => ({
      startedAt: iso(r.started_at),
      durationMs: r.duration_ms as number,
      ok: r.ok as boolean,
      error: (r.error as string) ?? null,
      counts: r.counts as Record<string, number>,
    })),
  };
}

export async function health() {
  const sql = db();
  const rows = await sql.unsafe(
    `SELECT s.id, s.name, s.country, s.interval_minutes, s.last_success_at, s.last_run_at, s.last_error,
            s.consecutive_failures, s.last_duration_ms, s.last_counts, ${HEALTH_SQL} AS health
     FROM sources s WHERE s.enabled ORDER BY s.id`,
  );
  const items = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    country: r.country as string,
    health: r.health as Health,
    intervalMinutes: r.interval_minutes as number,
    lastSuccessAt: iso(r.last_success_at),
    lastRunAt: iso(r.last_run_at),
    lastError: (r.last_error as string) ?? null,
    consecutiveFailures: r.consecutive_failures as number,
    lastDurationMs: (r.last_duration_ms as number) ?? null,
    counts: (r.last_counts as Record<string, number>) ?? {},
  }));
  const byHealth = { live: 0, stale: 0, failing: 0, pending: 0 } as Record<Health, number>;
  for (const i of items) byHealth[i.health]++;
  return { summary: byHealth, sources: items };
}

export async function overview() {
  const sql = db();
  const [[src], sev, [net], [last]] = await Promise.all([
    sql.unsafe(`SELECT
        count(*) FILTER (WHERE h = 'live') AS live, count(*) FILTER (WHERE h = 'stale') AS stale,
        count(*) FILTER (WHERE h = 'failing') AS failing, count(*) FILTER (WHERE h = 'pending') AS pending,
        count(*) AS total, count(DISTINCT country) FILTER (WHERE h = 'live') AS countries,
        count(DISTINCT coalesce(city, country)) FILTER (WHERE h = 'live') AS cities
      FROM (SELECT s.country, s.city, ${HEALTH_SQL} AS h FROM sources s WHERE s.enabled) x`),
    sql`SELECT severity, count(*)::int AS n FROM alerts WHERE active GROUP BY severity`,
    sql`SELECT
        (SELECT count(*) FROM line_status) AS lines,
        (SELECT count(*) FROM line_status WHERE status NOT IN ('good','unknown')) AS lines_disrupted,
        (SELECT count(*) FROM stations) AS stations,
        (SELECT count(*) FROM stations WHERE status IN ('delays','major_delays','closed')) AS stations_delayed,
        (SELECT count(*) FROM vehicles) AS vehicles,
        (SELECT count(*) FROM departures) AS departures`,
    sql`SELECT max(last_success_at) AS at FROM sources`,
  ]);
  const alertsBySeverity: Record<string, number> = { info: 0, minor: 0, major: 0, severe: 0 };
  for (const r of sev) alertsBySeverity[r.severity as string] = r.n as number;
  const num = (v: unknown) => Number(v ?? 0);
  return {
    sources: {
      total: num(src.total),
      live: num(src.live),
      stale: num(src.stale),
      failing: num(src.failing),
      pending: num(src.pending),
    },
    countries: num(src.countries),
    cities: num(src.cities),
    activeAlerts: Object.values(alertsBySeverity).reduce((a, b) => a + b, 0),
    alertsBySeverity,
    lines: num(net.lines),
    linesDisrupted: num(net.lines_disrupted),
    stations: num(net.stations),
    stationsDelayed: num(net.stations_delayed),
    vehicles: num(net.vehicles),
    departures: num(net.departures),
    lastIngestAt: iso(last.at),
  };
}
