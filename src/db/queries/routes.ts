import { db } from "../client";
import { clampLimit, iso } from "./common";
import { mapAlert } from "./alerts";
import { mapLine, mapVehicle } from "./network";
import { routeShapes } from "./geo";

type Row = Record<string, unknown>;

export interface RouteItem {
  sourceId: string;
  routeId: string;
  name: string;
  shortName: string | null;
  longName: string | null;
  mode: string;
  color: string | null;
  textColor: string | null;
  /** Encoded polylines (Google format, precision 5). Present when geometry was requested. */
  shapes?: string[];
  bbox: [number, number, number, number] | null;
}

function mapRoute(r: Row): RouteItem {
  return {
    sourceId: r.source_id as string,
    routeId: r.route_id as string,
    name: r.name as string,
    shortName: (r.short_name as string) ?? null,
    longName: (r.long_name as string) ?? null,
    mode: r.mode as string,
    color: (r.color as string) ?? null,
    textColor: (r.text_color as string) ?? null,
    bbox: r.min_lon == null ? null : [r.min_lon as number, r.min_lat as number, r.max_lon as number, r.max_lat as number],
  };
}

export interface RouteFilter {
  sourceId?: string;
  bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  mode?: string;
  geometry?: boolean;
  limit?: number;
}

/** Static line catalog, by source and/or intersecting a bounding box. Larger lines first inside a box. */
export async function listRoutes(f: RouteFilter) {
  const sql = db();
  const b = f.bbox;
  const limit = clampLimit(f.limit, 500, 5000);
  const rows = await sql`
    SELECT source_id, route_id, name, short_name, long_name, mode, color, text_color, min_lat, min_lon, max_lat, max_lon
    FROM routes
    WHERE (${f.sourceId ?? null}::text IS NULL OR source_id = ${f.sourceId ?? null})
      AND (${f.mode ?? null}::text IS NULL OR mode = ${f.mode ?? null})
      ${b ? sql`AND max_lat >= ${b.minLat} AND min_lat <= ${b.maxLat} AND max_lon >= ${b.minLon} AND min_lon <= ${b.maxLon}` : sql``}
    ORDER BY ${b ? sql`CASE mode WHEN 'rail' THEN 0 WHEN 'metro' THEN 1 WHEN 'tram' THEN 2 WHEN 'ferry' THEN 3 WHEN 'cable' THEN 4 ELSE 5 END,` : sql``}
      source_id, sort_order NULLS LAST, name
    LIMIT ${limit}`;
  const items = rows.map(mapRoute);
  if (!f.geometry) return items;
  // Geometry lives on blob storage; gather each listed source's pieces for the requested area.
  const bySource = new Map<string, RouteItem[]>();
  for (const i of items) (bySource.get(i.sourceId) ?? bySource.set(i.sourceId, []).get(i.sourceId)!).push(i);
  await Promise.all([...bySource].map(async ([sourceId, list]) => {
    const shapes = await routeShapes(sourceId, { routeIds: list.map((x) => x.routeId), bbox: b });
    for (const i of list) i.shapes = shapes.get(i.routeId) ?? [];
  }));
  return items;
}

/** One line of a source with its catalog entry, live vehicles, matching alerts and status history. */
export async function getLine(sourceId: string, lineId: string) {
  const sql = db();
  const [[line], [route]] = await Promise.all([
    sql`SELECT l.*, s.last_success_at AS checked_at FROM lines_v l JOIN sources s ON s.id = l.source_id
        WHERE l.source_id = ${sourceId} AND l.line_id = ${lineId}`,
    sql`SELECT * FROM routes WHERE source_id = ${sourceId} AND route_id = ${lineId}`,
  ]);
  if (!line && !route) return null;
  const name = (line?.line_name ?? route?.name) as string;
  const [vehicles, alerts, history] = await Promise.all([
    sql`SELECT * FROM vehicles WHERE source_id = ${sourceId} AND (route_id = ${lineId} OR (route_id IS NULL AND route_name = ${name})) LIMIT 1000`,
    sql`SELECT a.*, s.name AS source_name, s.country, s.city FROM alerts a JOIN sources s ON s.id = a.source_id
        WHERE a.source_id = ${sourceId} AND a.active AND (${lineId} = ANY(a.routes) OR ${name} = ANY(a.routes))
        ORDER BY CASE a.severity WHEN 'severe' THEN 4 WHEN 'major' THEN 3 WHEN 'minor' THEN 2 ELSE 1 END DESC, a.last_seen_at DESC
        LIMIT 50`,
    sql`SELECT from_status, to_status, status_text, at FROM status_events
        WHERE source_id = ${sourceId} AND subject = 'line' AND subject_id = ${lineId} ORDER BY at DESC LIMIT 50`,
  ]);
  return {
    sourceId,
    lineId,
    name,
    longName: (route?.long_name as string) ?? null,
    mode: (line?.mode ?? route?.mode) as string,
    color: ((line?.color ?? route?.color) as string) ?? null,
    textColor: (route?.text_color as string) ?? null,
    status: line ? mapLine(line) : null,
    shapes: route ? (await routeShapes(sourceId, { routeIds: [lineId] })).get(lineId) ?? [] : [],
    bbox: route?.min_lon == null ? null : ([route.min_lon, route.min_lat, route.max_lon, route.max_lat] as [number, number, number, number]),
    vehicles: vehicles.map(mapVehicle),
    alerts: alerts.map(mapAlert),
    history: history.map((h) => ({
      from: (h.from_status as string) ?? null,
      to: h.to_status as string,
      text: (h.status_text as string) ?? null,
      at: iso(h.at)!,
    })),
  };
}

/** Per-source route catalog sizes, for coverage pages. */
export async function routeCounts(): Promise<Record<string, number>> {
  const sql = db();
  const rows = await sql`SELECT source_id, count(*)::int AS n FROM routes GROUP BY source_id`;
  return Object.fromEntries(rows.map((r) => [r.source_id as string, r.n as number]));
}

export interface StopItem {
  sourceId: string;
  name: string;
  lat: number;
  lon: number;
}

const TILE = 0.05;

/** Stops inside a bounding box, for maps. */
export async function stopsInBbox(b: { minLat: number; minLon: number; maxLat: number; maxLon: number }, limit?: number): Promise<StopItem[]> {
  const sql = db();
  const max = clampLimit(limit, 3000, 10000);
  const rows = await sql`
    SELECT source_id, names, lats, lons FROM stop_tiles
    WHERE tx BETWEEN ${Math.floor(b.minLon / TILE)} AND ${Math.floor(b.maxLon / TILE)}
      AND ty BETWEEN ${Math.floor(b.minLat / TILE)} AND ${Math.floor(b.maxLat / TILE)}
    LIMIT 2000`;
  const out: StopItem[] = [];
  for (const r of rows) {
    const names = (r.names as string).split("\n");
    const lats = r.lats as number[];
    const lons = r.lons as number[];
    for (let i = 0; i < names.length && out.length < max; i++) {
      if (lats[i] < b.minLat || lats[i] > b.maxLat || lons[i] < b.minLon || lons[i] > b.maxLon) continue;
      out.push({ sourceId: r.source_id as string, name: names[i], lat: lats[i], lon: lons[i] });
    }
  }
  return out;
}
