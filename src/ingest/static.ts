import type postgres from "postgres";
import feeds from "@/connectors/static-gtfs.json";
import { scheduleFeeds } from "@/connectors/schedule";
import { globalFeeds } from "@/connectors/global-gtfs";
import { connectorById } from "@/connectors";
import { upsertSources } from "@/db/persist";
import { readStaticGtfs, readStops, type StaticRoute, type StaticStop } from "@/lib/gtfs-static";
import { RemoteZip } from "@/lib/remote-zip";
import { publishGeo } from "./geo";
import type { Mode } from "@/lib/types";

/** `compact`: coarser geometry, for timetable-only networks that are numerous and small. */
type StaticFeed = { urls: string[]; modes?: Mode[]; compact?: boolean };

/** Static schedule zips per source: hand-linked realtime sources, timetable-only sources, and catalog-listed realtime feeds. */
export const staticFeeds: Record<string, StaticFeed> = {
  ...Object.fromEntries(globalFeeds.filter((f) => f.static?.length).map((f) => [f.id, { urls: f.static! }])),
  ...Object.fromEntries(scheduleFeeds.map((f) => [f.id, { urls: f.static, compact: true }])),
  ...(feeds as Record<string, StaticFeed>),
};

const REFRESH_DAYS = 7;
const RETRY_HOURS = 24;
const PER_FEED_TIMEOUT_MS = 240_000;

/** Read every static feed of a source and merge them (a later feed wins on a shared route or stop id). */
export async function readSource(sourceId: string, signal: AbortSignal): Promise<{ routes: StaticRoute[]; stops: StaticStop[] }> {
  const cfg = staticFeeds[sourceId];
  if (!cfg) throw new Error(`no static feed configured for ${sourceId}`);
  const routes = new Map<string, StaticRoute>();
  const stops = new Map<string, StaticStop>();
  for (const url of cfg.urls) {
    const zip = await RemoteZip.open(url, signal);
    try {
      const r = await readStaticGtfs(zip, { modes: cfg.modes, signal, ...(cfg.compact ? { tolerance: 25, maxPerRoute: 1 } : {}) });
      for (const x of r.routes) routes.set(x.routeId, x);
      for (const x of await readStops(zip, { stationsOnly: !!cfg.modes, signal })) stops.set(x.stopId, x);
    } finally {
      await zip.close();
    }
  }
  return { routes: [...routes.values()], stops: [...stops.values()] };
}

/** Tile edge in degrees; about 5.5 km of latitude. */
export const TILE = 0.05;

/** Group stops into tiles: names joined by newlines with parallel coordinate arrays. */
export function packStops(stops: StaticStop[]) {
  const tiles = new Map<string, { tx: number; ty: number; names: string[]; lats: number[]; lons: number[] }>();
  for (const s of stops) {
    const tx = Math.floor(s.lon / TILE);
    const ty = Math.floor(s.lat / TILE);
    const k = `${tx}|${ty}`;
    const t = tiles.get(k) ?? tiles.set(k, { tx, ty, names: [], lats: [], lons: [] }).get(k)!;
    t.names.push(s.name.replace(/\n/g, " "));
    t.lats.push(s.lat);
    t.lons.push(s.lon);
  }
  return [...tiles.values()].map((t) => ({ ...t, names: t.names.join("\n") }));
}

export async function saveCatalog(sql: postgres.Sql, sourceId: string, routes: StaticRoute[], stops: StaticStop[]) {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM stop_tiles WHERE source_id = ${sourceId}`;
    const tiles = packStops(stops).map((t) => ({ source_id: sourceId, ...t }));
    for (let i = 0; i < tiles.length; i += 500) await tx`INSERT INTO stop_tiles ${tx(tiles.slice(i, i + 500) as never)}`;
    await tx`DELETE FROM routes WHERE source_id = ${sourceId}`;
    for (let i = 0; i < routes.length; i += 300) {
      await tx`INSERT INTO routes ${tx(
        routes.slice(i, i + 300).map((r) => ({
          source_id: sourceId,
          route_id: r.routeId,
          short_name: r.shortName,
          long_name: r.longName,
          name: r.name,
          mode: r.mode,
          color: r.color,
          text_color: r.textColor,
          sort_order: r.sortOrder != null && Number.isFinite(r.sortOrder) ? Math.round(r.sortOrder) : null,
          // Geometry is published to blob storage by publishGeo; only the bounding box stays here.
          shapes: [],
          min_lat: r.bbox?.minLat ?? null,
          min_lon: r.bbox?.minLon ?? null,
          max_lat: r.bbox?.maxLat ?? null,
          max_lon: r.bbox?.maxLon ?? null,
        })) as never,
      )}`;
    }
  });
}

export interface StaticSummary {
  imported: { id: string; routes: number; shapes: number; stops: number; ms: number }[];
  failed: { id: string; error: string }[];
  remaining: number;
}

export async function importOne(sql: postgres.Sql, id: string, timeoutMs = PER_FEED_TIMEOUT_MS) {
  const t0 = Date.now();
  await sql`
    INSERT INTO static_imports (source_id, urls, attempted_at) VALUES (${id}, ${staticFeeds[id].urls}, now())
    ON CONFLICT (source_id) DO UPDATE SET urls = EXCLUDED.urls, attempted_at = now()`;
  try {
    const { routes, stops } = await Promise.race([
      readSource(id, AbortSignal.timeout(timeoutMs)),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs + 5_000).unref()),
    ]);
    if (!routes.length) throw new Error("feed has no routes");
    await saveCatalog(sql, id, routes, stops);
    await publishGeo(sql, id, routes);
    const shapes = routes.reduce((n, r) => n + r.shapes.length, 0);
    const ms = Date.now() - t0;
    await sql`
      UPDATE static_imports SET imported_at = now(), ok = true, error = NULL, routes = ${routes.length},
        shapes = ${shapes}, stops = ${stops.length}, duration_ms = ${ms}
      WHERE source_id = ${id}`;
    // Poll it on the next tick so its lines appear right away.
    await sql`UPDATE sources SET last_run_at = NULL WHERE id = ${id}`;
    return { ok: true as const, routes: routes.length, shapes, stops: stops.length, ms };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await sql`UPDATE static_imports SET ok = false, error = ${error}, duration_ms = ${Date.now() - t0} WHERE source_id = ${id}`;
    return { ok: false as const, error };
  }
}

/** Sources whose catalog is missing, older than a week, or failed more than a day ago. Never-tried first. */
export async function dueStatic(sql: postgres.Sql, ids = Object.keys(staticFeeds)): Promise<string[]> {
  const rows = await sql`
    SELECT s.id FROM sources s LEFT JOIN static_imports i ON i.source_id = s.id
    WHERE s.enabled AND s.id = ANY(${ids})
      AND (i.attempted_at IS NULL
        OR (i.ok AND i.imported_at < now() - make_interval(days => ${REFRESH_DAYS}))
        OR (NOT coalesce(i.ok, false) AND i.attempted_at < now() - make_interval(hours => ${RETRY_HOURS})))
    ORDER BY i.attempted_at NULLS FIRST`;
  return rows.map((r) => r.id as string);
}

/** Import due static feeds one after another until the time budget runs out. */
export async function importDueStatic(
  sql: postgres.Sql,
  opts: { budgetMs?: number; only?: string[]; force?: boolean; concurrency?: number } = {},
): Promise<StaticSummary> {
  const deadline = Date.now() + (opts.budgetMs ?? 270_000);
  const ids = (opts.only ?? Object.keys(staticFeeds)).filter((id) => staticFeeds[id] && connectorById.has(id));
  await upsertSources(sql, ids.map((id) => connectorById.get(id)!.meta));
  const queue = opts.force ? [...ids] : await dueStatic(sql, ids);
  const summary: StaticSummary = { imported: [], failed: [], remaining: 0 };
  await Promise.all(
    Array.from({ length: opts.concurrency ?? 1 }, async () => {
      while (queue.length) {
        const left = deadline - Date.now();
        if (left < 60_000) break;
        const id = queue.shift()!;
        const r = await importOne(sql, id, Math.min(PER_FEED_TIMEOUT_MS, left - 10_000));
        if (r.ok) summary.imported.push({ id, routes: r.routes, shapes: r.shapes, stops: r.stops, ms: r.ms });
        else summary.failed.push({ id, error: r.error });
      }
    }),
  );
  summary.remaining = queue.length;
  return summary;
}
