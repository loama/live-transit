import { db } from "../client";
import { clampLimit, iso, normalizeService } from "./common";

type Row = Record<string, unknown>;

export interface LineItem {
  sourceId: string;
  sourceName?: string;
  country?: string;
  city?: string | null;
  lineId: string;
  lineName: string;
  mode: string;
  color: string | null;
  status: string;
  statusText: string;
  since: string;
  updatedAt: string;
  /** Vehicles currently reporting a position on this line, when known. */
  vehicles?: number;
  /** Long name from the static GTFS catalog. */
  longName?: string | null;
  /** Whether route geometry is available for maps. */
  hasShape?: boolean;
  /** [minLon, minLat, maxLon, maxLat] of the line's geometry. */
  bbox?: [number, number, number, number];
}

export function mapLine(r: Row): LineItem {
  return {
    sourceId: r.source_id as string,
    ...(r.source_name ? { sourceName: r.source_name as string } : {}),
    ...(r.country ? { country: r.country as string, city: (r.city as string) ?? null } : {}),
    lineId: r.line_id as string,
    lineName: r.line_name as string,
    mode: r.mode as string,
    color: (r.color as string) ?? null,
    status: r.status as string,
    statusText: r.status_text as string,
    since: iso(r.since)!,
    // Rows are only rewritten on change; a successful poll of the source confirms them too.
    updatedAt: iso(latest(r.updated_at, r.checked_at))!,
    ...(r.vehicles != null ? { vehicles: Number(r.vehicles) } : {}),
    ...(r.long_name !== undefined ? { longName: (r.long_name as string) ?? null } : {}),
    ...(r.has_shape != null ? { hasShape: !!r.has_shape } : {}),
    ...(r.min_lon != null ? { bbox: [r.min_lon, r.min_lat, r.max_lon, r.max_lat] as [number, number, number, number] } : {}),
  };
}

const latest = (a: unknown, b: unknown) => (b instanceof Date && a instanceof Date && b > a ? b : a);

export interface StationItem {
  sourceId: string;
  sourceName?: string;
  stationId: string;
  name: string;
  mode: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  status: string;
  statusText: string | null;
  delayMinutes: number | null;
  since: string;
  updatedAt: string;
}

export function mapStation(r: Row): StationItem {
  return {
    sourceId: r.source_id as string,
    ...(r.source_name ? { sourceName: r.source_name as string } : {}),
    stationId: r.station_id as string,
    name: r.name as string,
    mode: r.mode as string,
    city: (r.city as string) ?? null,
    country: (r.country as string) ?? null,
    lat: (r.lat as number) ?? null,
    lon: (r.lon as number) ?? null,
    status: r.status as string,
    statusText: (r.status_text as string) ?? null,
    delayMinutes: (r.delay_minutes as number) ?? null,
    since: iso(r.since)!,
    updatedAt: iso(r.updated_at)!,
  };
}

export async function listLines(f: { sourceId?: string; country?: string; mode?: string; disruptedOnly?: boolean } = {}) {
  const sql = db();
  const rows = await sql`
    SELECT l.*, s.name AS source_name, s.country, s.city, s.last_success_at AS checked_at FROM lines_v l JOIN sources s ON s.id = l.source_id
    WHERE (${f.sourceId ?? null}::text IS NULL OR l.source_id = ${f.sourceId ?? null})
      AND (${f.country?.toLowerCase() ?? null}::text IS NULL OR s.country = ${f.country?.toLowerCase() ?? null})
      AND (${f.mode ?? null}::text IS NULL OR l.mode = ${f.mode ?? null})
      AND (${!!f.disruptedOnly} = false OR l.status NOT IN ('good', 'unknown'))
    ORDER BY s.country, s.name, l.line_name LIMIT 2000`;
  return rows.map(mapLine);
}

export async function listStations(f: { mode?: string; country?: string; status?: string; q?: string; limit?: number } = {}) {
  const sql = db();
  const limit = clampLimit(f.limit, 200, 1000);
  const rows = await sql`
    SELECT st.*, s.name AS source_name FROM stations st JOIN sources s ON s.id = st.source_id
    WHERE (${f.mode ?? null}::text IS NULL OR st.mode = ${f.mode ?? null})
      AND (${f.country?.toLowerCase() ?? null}::text IS NULL OR coalesce(st.country, s.country) = ${f.country?.toLowerCase() ?? null})
      AND (${f.status ?? null}::text IS NULL OR st.status = ${f.status ?? null})
      AND (${f.q ?? null}::text IS NULL OR st.name ILIKE '%' || ${f.q ?? null} || '%' OR upper(st.station_id) = upper(${f.q ?? null})
           OR st.city ILIKE '%' || ${f.q ?? null} || '%')
    ORDER BY CASE st.status WHEN 'closed' THEN 0 WHEN 'major_delays' THEN 1 WHEN 'delays' THEN 2 ELSE 3 END, st.name
    LIMIT ${limit}`;
  return rows.map(mapStation);
}

/** A station or airport by id (IATA codes are case-insensitive). Merges entries from several sources. */
export async function getStation(stationId: string) {
  const sql = db();
  const rows = await sql`
    SELECT st.*, s.name AS source_name, s.last_success_at FROM stations st JOIN sources s ON s.id = st.source_id
    WHERE upper(st.station_id) = upper(${stationId})
    ORDER BY st.updated_at DESC`;
  if (!rows.length) return null;
  const primary = mapStation(rows[0]);
  return { ...primary, reports: rows.map(mapStation) };
}

export interface DepartureItem {
  sourceId: string;
  id: string;
  stationId: string;
  stationName: string;
  direction: string;
  mode: string;
  service: string;
  carrier: string | null;
  counterpart: string | null;
  scheduledAt: string;
  estimatedAt: string | null;
  platform: string | null;
  status: string;
  statusText: string | null;
  delayMinutes: number | null;
}

export function mapDeparture(r: Row): DepartureItem {
  return {
    sourceId: r.source_id as string,
    id: r.id as string,
    stationId: r.station_id as string,
    stationName: r.station_name as string,
    direction: r.direction as string,
    mode: r.mode as string,
    service: r.service as string,
    carrier: (r.carrier as string) ?? null,
    counterpart: (r.counterpart as string) ?? null,
    scheduledAt: iso(r.scheduled_at)!,
    estimatedAt: iso(r.estimated_at),
    platform: (r.platform as string) ?? null,
    status: r.status as string,
    statusText: (r.status_text as string) ?? null,
    delayMinutes: (r.delay_minutes as number) ?? null,
  };
}

export async function getBoard(f: { stationId: string; direction?: "departure" | "arrival"; from?: Date; limit?: number }) {
  const sql = db();
  const limit = clampLimit(f.limit, 60, 500);
  const from = f.from ?? new Date(Date.now() - 30 * 60_000);
  const rows = await sql`
    SELECT * FROM departures
    WHERE upper(station_id) = upper(${f.stationId})
      AND (${f.direction ?? null}::text IS NULL OR direction = ${f.direction ?? null})
      AND coalesce(estimated_at, scheduled_at) >= ${from}
    ORDER BY coalesce(estimated_at, scheduled_at) LIMIT ${limit}`;
  return rows.map(mapDeparture);
}

/** Flight or train number lookup across every board, e.g. "LA 2365" or "ic 512". */
export async function findService(q: string, limit = 50) {
  const sql = db();
  const n = normalizeService(q);
  if (n.length < 2) return [];
  const rows = await sql`
    SELECT * FROM departures
    WHERE replace(replace(upper(service), ' ', ''), '-', '') = ${n}
    ORDER BY scheduled_at LIMIT ${clampLimit(limit, 50, 200)}`;
  return rows.map(mapDeparture);
}

export interface VehicleItem {
  sourceId: string;
  id: string;
  mode: string;
  routeId: string | null;
  routeName: string | null;
  tripId: string | null;
  headsign: string | null;
  lat: number;
  lon: number;
  bearing: number | null;
  speed: number | null;
  label: string | null;
  color: string | null;
  delaySeconds: number | null;
  observedAt: string | null;
}

export function mapVehicle(r: Row): VehicleItem {
  return {
    sourceId: r.source_id as string,
    id: r.id as string,
    mode: r.mode as string,
    routeId: (r.route_id as string) ?? null,
    routeName: (r.route_name as string) ?? null,
    tripId: (r.trip_id as string) ?? null,
    headsign: (r.headsign as string) ?? null,
    lat: r.lat as number,
    lon: r.lon as number,
    bearing: (r.bearing as number) ?? null,
    speed: (r.speed as number) ?? null,
    label: (r.label as string) ?? null,
    color: (r.color as string) ?? null,
    delaySeconds: (r.delay_seconds as number) ?? null,
    observedAt: iso(r.observed_at),
  };
}

export async function vehiclesInBbox(f: {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
  mode?: string;
  limit?: number;
}) {
  const sql = db();
  const rows = await sql`
    SELECT * FROM vehicles
    WHERE lat BETWEEN ${f.minLat} AND ${f.maxLat} AND lon BETWEEN ${f.minLon} AND ${f.maxLon}
      AND (${f.mode ?? null}::text IS NULL OR mode = ${f.mode ?? null})
    LIMIT ${clampLimit(f.limit, 2000, 5000)}`;
  return rows.map(mapVehicle);
}

export async function vehiclesBySource(sourceId: string, limit?: number) {
  const sql = db();
  const rows = await sql`SELECT * FROM vehicles WHERE source_id = ${sourceId} LIMIT ${clampLimit(limit, 2000, 5000)}`;
  return rows.map(mapVehicle);
}

/** Vehicles within radius_km of a point, nearest first. */
export async function vehiclesNear(lat: number, lon: number, radiusKm: number, mode?: string, limit = 50) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const items = await vehiclesInBbox({
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLon: lon - dLon,
    maxLon: lon + dLon,
    mode,
    limit: 5000,
  });
  const km = (v: VehicleItem) => {
    const x = (v.lon - lon) * Math.cos((lat * Math.PI) / 180);
    const y = v.lat - lat;
    return Math.sqrt(x * x + y * y) * 111;
  };
  return items
    .map((v) => ({ ...v, distanceKm: Math.round(km(v) * 100) / 100 }))
    .filter((v) => v.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
