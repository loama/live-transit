import { bboxOf, encodePolyline, simplify, type Bbox, type Point } from "./polyline";
import type { RemoteZip } from "./remote-zip";
import type { Mode } from "./types";

/** GTFS route_type, including the extended codes some feeds use, to our Mode. */
export function modeFromRouteType(t: number): Mode {
  if (t === 0 || (t >= 900 && t < 1000)) return "tram";
  if (t === 1 || (t >= 400 && t < 500)) return "metro";
  if (t === 2 || (t >= 100 && t < 200)) return "rail";
  if (t === 4 || (t >= 1000 && t < 1100) || t === 1200) return "ferry";
  if (t === 5 || t === 6 || t === 7 || t === 1300 || t === 1400) return "cable";
  if (t === 3 || t === 11 || (t >= 200 && t < 300) || (t >= 700 && t < 900)) return "bus";
  return "other";
}

export function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Column index lookup for a GTFS header row, tolerant of stray spaces and quotes. */
export function header(line: string): (name: string) => number {
  const cols = parseCsvLine(line).map((c) => c.trim().replace(/^"|"$/g, ""));
  return (name) => cols.indexOf(name);
}

function* csvRows(text: string): Generator<string> {
  for (const l of text.replace(/^﻿/, "").split(/\r?\n/)) if (l.trim()) yield l;
}

export interface StaticRoute {
  routeId: string;
  shortName: string | null;
  longName: string | null;
  /** Display name: short name, else long name, else id. */
  name: string;
  mode: Mode;
  color: string | null;
  textColor: string | null;
  sortOrder: number | null;
  /** Encoded polylines (precision 5), one per representative shape. */
  shapes: string[];
  bbox: Bbox | null;
}

const hex = (s: string | undefined) => {
  const c = s?.trim().replace(/^#/, "").toUpperCase();
  return c && /^[0-9A-F]{6}$/.test(c) ? c : null;
};

export function parseRoutes(csv: string, modes?: Mode[]): StaticRoute[] {
  const rows = csvRows(csv);
  const first = rows.next();
  if (first.done) return [];
  const col = header(first.value);
  const [id, sn, ln, type, color, text, sort] = ["route_id", "route_short_name", "route_long_name", "route_type", "route_color", "route_text_color", "route_sort_order"].map(col);
  if (id < 0) throw new Error("routes.txt has no route_id column");
  const out: StaticRoute[] = [];
  for (const line of rows) {
    const f = parseCsvLine(line);
    const routeId = f[id]?.trim();
    if (!routeId) continue;
    const mode = modeFromRouteType(Number(f[type]));
    if (modes && !modes.includes(mode)) continue;
    const shortName = f[sn]?.trim() || null;
    const longName = f[ln]?.trim() || null;
    let c = hex(f[color]);
    // FFFFFF is the common "not set" value and is invisible on a light basemap.
    if (c === "FFFFFF") c = null;
    out.push({
      routeId,
      shortName,
      longName,
      name: (shortName ?? longName ?? routeId).slice(0, 120),
      mode,
      color: c,
      textColor: hex(f[text]),
      sortOrder: sort >= 0 && f[sort]?.trim() ? Number(f[sort]) : null,
      shapes: [],
      bbox: null,
    });
  }
  return out;
}

export interface ShapeChoiceOptions {
  /** Shapes kept per route at most. */
  maxPerRoute?: number;
  /** A secondary shape is kept only if it carries at least this share of its direction's main shape trips. */
  minShare?: number;
}

/** trip rows -> route_id -> chosen shape ids (most used shape per direction, plus significant branches). */
export function chooseShapes(tripCounts: Map<string, Map<string, number>>, o: ShapeChoiceOptions = {}): Map<string, string[]> {
  const max = o.maxPerRoute ?? 4;
  const share = o.minShare ?? 0.25;
  const out = new Map<string, string[]>();
  for (const [routeId, byShape] of tripCounts) {
    const byDir = new Map<string, [string, number][]>();
    for (const [key, n] of byShape) {
      const [dir, shape] = key.split("\u0000");
      (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push([shape, n]);
    }
    const picks: [string, number][] = [];
    for (const list of byDir.values()) {
      list.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const top = list[0][1];
      for (const [s, n] of list) if (n >= top * share) picks.push([s, n / top]);
    }
    picks.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    out.set(routeId, [...new Set(picks.map((p) => p[0]))].slice(0, max));
  }
  return out;
}

/** Shapes that double back over long distances this often interleave two paths and draw as a zig-zag. */
const MAX_REVERSALS = 5;
const REVERSAL_LEG_M = 150;

/** Times the path turns back on itself with both legs longer than REVERSAL_LEG_M. */
export function longReversals(p: Point[]): number {
  if (p.length < 3) return 0;
  const kx = 111_320 * Math.cos((p[0][1] * Math.PI) / 180);
  const ky = 110_540;
  let n = 0;
  for (let i = 2; i < p.length; i++) {
    const ax = (p[i - 1][0] - p[i - 2][0]) * kx, ay = (p[i - 1][1] - p[i - 2][1]) * ky;
    const bx = (p[i][0] - p[i - 1][0]) * kx, by = (p[i][1] - p[i - 1][1]) * ky;
    if (ax * bx + ay * by < 0 && Math.hypot(ax, ay) > REVERSAL_LEG_M && Math.hypot(bx, by) > REVERSAL_LEG_M) n++;
  }
  return n;
}

/** stop_times.txt is only scanned for stop-sequence geometry when it is smaller than this, compressed. */
const MAX_STOP_TIMES_BYTES = 200 * 1024 * 1024;

/**
 * Geometry for routes whose feed publishes no shape: one representative trip per direction, drawn through its
 * stops in order. Coarser than a real shape, but it shows where the line runs.
 */
async function stopSequenceShapes(zip: RemoteZip, routes: StaticRoute[], sampleTrip: Map<string, Map<string, string>>, o: ReadStaticOptions) {
  const st = zip.find("stop_times.txt");
  if (!routes.length || !st || st.compressedSize > MAX_STOP_TIMES_BYTES) return;
  const wanted = new Map<string, [number, string][]>();
  for (const r of routes) for (const t of sampleTrip.get(r.routeId)!.values()) wanted.set(t, []);
  let col: ((n: string) => number) | undefined;
  let ti = -1, si = -1, qi = -1, n = 0;
  for await (const line of zip.lines("stop_times.txt")) {
    if (!col) {
      col = header(line);
      [ti, si, qi] = [col("trip_id"), col("stop_id"), col("stop_sequence")];
      if (ti < 0 || si < 0) return;
      continue;
    }
    if ((++n & 0xffff) === 0) o.signal?.throwIfAborted();
    const f = parseCsvLine(line);
    const seq = wanted.get(f[ti]?.trim());
    const stop = f[si]?.trim();
    if (seq && stop) seq.push([qi >= 0 ? Number(f[qi]) : seq.length, stop]);
  }
  const needed = new Set([...wanted.values()].flatMap((s) => s.map((x) => x[1])));
  const pos = new Map<string, Point>();
  col = undefined;
  let id = -1, la = -1, lo = -1;
  for await (const line of zip.lines("stops.txt")) {
    if (!col) {
      col = header(line);
      [id, la, lo] = [col("stop_id"), col("stop_lat"), col("stop_lon")];
      continue;
    }
    const f = parseCsvLine(line);
    const sid = f[id]?.trim();
    if (!needed.has(sid)) continue;
    const lat = Number(f[la]);
    const lon = Number(f[lo]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) pos.set(sid, [lon, lat]);
  }
  const tol = o.tolerance ?? 8;
  for (const r of routes) {
    const lines: Point[][] = [];
    for (const t of sampleTrip.get(r.routeId)!.values()) {
      const pts = wanted.get(t)!.sort((a, b) => a[0] - b[0]).map((x) => pos.get(x[1])).filter((p): p is Point => !!p);
      if (pts.length < 2) continue;
      const enc = encodePolyline(simplify(pts, tol));
      if (!r.shapes.includes(enc)) {
        r.shapes.push(enc);
        lines.push(pts);
      }
      if (o.maxPerRoute && r.shapes.length >= o.maxPerRoute) break;
    }
    r.bbox = bboxOf(lines) ?? null;
  }
}

export interface ReadStaticOptions extends ShapeChoiceOptions {
  modes?: Mode[];
  /** Simplification tolerance in meters. */
  tolerance?: number;
  signal?: AbortSignal;
}

export interface StaticStop {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * One stop per boarding place: stations, plus stops that do not belong to a station. Platforms, entrances and
 * nodes are folded away, and same-named stops within about 150 m are merged. With `stationsOnly`, only explicit
 * stations are kept (used when a feed is filtered to some modes and its other stops would not belong).
 */
export async function readStops(zip: RemoteZip, o: { stationsOnly?: boolean; signal?: AbortSignal } = {}): Promise<StaticStop[]> {
  const seen = new Set<string>();
  const out: StaticStop[] = [];
  let col: ((n: string) => number) | undefined;
  let id = -1, nm = -1, la = -1, lo = -1, lt = -1, ps = -1;
  let n = 0;
  for await (const line of zip.lines("stops.txt")) {
    if (!col) {
      col = header(line);
      [id, nm, la, lo, lt, ps] = ["stop_id", "stop_name", "stop_lat", "stop_lon", "location_type", "parent_station"].map(col);
      if (id < 0 || nm < 0 || la < 0 || lo < 0) return [];
      continue;
    }
    if ((++n & 0xffff) === 0) o.signal?.throwIfAborted();
    if (!line) continue;
    const f = parseCsvLine(line);
    const type = lt >= 0 ? f[lt]?.trim() || "0" : "0";
    const station = type === "1";
    if (!station && (o.stationsOnly || type !== "0" || (ps >= 0 && f[ps]?.trim()))) continue;
    const name = f[nm]?.trim().replace(/\s+/g, " ");
    const lat = Number(f[la]);
    const lon = Number(f[lo]);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const key = `${name.toLowerCase()}|${Math.round(lat * 700)}|${Math.round(lon * 700)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ stopId: f[id].trim(), name: name.slice(0, 200), lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 });
  }
  return out;
}

export interface StaticResult {
  routes: StaticRoute[];
  stats: { routes: number; trips: number; shapePoints: number; shapesKept: number; shapesRejected: number; ms: number };
}

/** Read routes and representative simplified shapes out of a GTFS zip. Never touches stop_times.txt. */
export async function readStaticGtfs(zip: RemoteZip, o: ReadStaticOptions = {}): Promise<StaticResult> {
  const t0 = Date.now();
  const routesCsv = await zip.text("routes.txt");
  if (!routesCsv) throw new Error("routes.txt not found in zip");
  const routes = parseRoutes(routesCsv, o.modes);
  const byId = new Map(routes.map((r) => [r.routeId, r]));
  const stats = { routes: routes.length, trips: 0, shapePoints: 0, shapesKept: 0, shapesRejected: 0, ms: 0 };

  // route_id -> "direction\0shape_id" -> trip count
  const counts = new Map<string, Map<string, number>>();
  // route_id -> direction -> first trip, used for routes whose trips carry no shape.
  const sampleTrip = new Map<string, Map<string, string>>();
  const hasShapes = !!zip.find("shapes.txt");
  {
    let col: ((n: string) => number) | undefined;
    let ri = -1, si = -1, di = -1, ti = -1;
    for await (const line of zip.lines("trips.txt")) {
      if (!col) {
        col = header(line);
        [ri, si, di, ti] = [col("route_id"), col("shape_id"), col("direction_id"), col("trip_id")];
        if (ri < 0) break;
        continue;
      }
      if (!line) continue;
      const f = parseCsvLine(line);
      const r = f[ri]?.trim();
      if (!r || !byId.has(r)) continue;
      const dir = di >= 0 ? (f[di]?.trim() ?? "") : "";
      const s = hasShapes && si >= 0 ? f[si]?.trim() : "";
      if (!s) {
        const t = ti >= 0 ? f[ti]?.trim() : "";
        const m = sampleTrip.get(r) ?? sampleTrip.set(r, new Map()).get(r)!;
        if (t && !m.has(dir)) m.set(dir, t);
        continue;
      }
      stats.trips++;
      const k = `${dir}\u0000${s}`;
      const m = counts.get(r) ?? counts.set(r, new Map()).get(r)!;
      m.set(k, (m.get(k) ?? 0) + 1);
      if ((stats.trips & 0xffff) === 0) o.signal?.throwIfAborted();
    }
  }

  const chosen = chooseShapes(counts, o);
  const wanted = new Map<string, number[]>(); // shape_id -> flat [seq, lon, lat, ...]
  for (const ids of chosen.values()) for (const s of ids) wanted.set(s, []);

  if (wanted.size) {
    let col: ((n: string) => number) | undefined;
    let si = -1, la = -1, lo = -1, sq = -1;
    let n = 0;
    for await (const line of zip.lines("shapes.txt")) {
      if (!col) {
        col = header(line);
        [si, la, lo, sq] = [col("shape_id"), col("shape_pt_lat"), col("shape_pt_lon"), col("shape_pt_sequence")];
        if (si < 0 || la < 0 || lo < 0) break;
        continue;
      }
      if ((++n & 0xffff) === 0) o.signal?.throwIfAborted();
      const f = parseCsvLine(line);
      const pts = wanted.get(f[si]?.trim());
      if (!pts) continue;
      const lat = Number(f[la]);
      const lon = Number(f[lo]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
      pts.push(sq >= 0 ? Number(f[sq]) : pts.length / 3, lon, lat);
      stats.shapePoints++;
    }
  }

  const tol = o.tolerance ?? 8;
  for (const [routeId, ids] of chosen) {
    const r = byId.get(routeId)!;
    const lines: Point[][] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const flat = wanted.get(id);
      if (!flat || flat.length < 6) continue;
      const idx = Array.from({ length: flat.length / 3 }, (_, i) => i).sort((a, b) => flat[a * 3] - flat[b * 3]);
      const raw = idx.map((i) => [flat[i * 3 + 1], flat[i * 3 + 2]] as Point);
      if (longReversals(raw) > MAX_REVERSALS) {
        stats.shapesRejected++;
        continue;
      }
      const pts = simplify(raw, tol);
      const enc = encodePolyline(pts);
      if (pts.length < 2 || seen.has(enc)) continue;
      seen.add(enc);
      lines.push(pts);
      r.shapes.push(enc);
    }
    r.bbox = bboxOf(lines) ?? null;
    stats.shapesKept += r.shapes.length;
  }
  await stopSequenceShapes(zip, routes.filter((r) => !r.shapes.length && sampleTrip.has(r.routeId)), sampleTrip, o);
  stats.ms = Date.now() - t0;
  return { routes, stats };
}
