import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../client";
import type { TileRoute } from "@/ingest/geo";

const CELL = 0.5;

export interface GeoTileRef { sourceId: string; tx: number; ty: number; url: string; bytes: number; routes: number }

/** Geometry files covering a bounding box, optionally for one source. */
export async function geoTiles(f: { bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number }; sourceId?: string; limit?: number }): Promise<GeoTileRef[]> {
  const sql = db();
  const b = f.bbox;
  const rows = await sql`
    SELECT source_id, tx, ty, url, bytes, routes FROM geo_tiles
    WHERE (${f.sourceId ?? null}::text IS NULL OR source_id = ${f.sourceId ?? null})
      ${b ? sql`AND tx BETWEEN ${Math.floor(b.minLon / CELL)} AND ${Math.floor(b.maxLon / CELL)}
                AND ty BETWEEN ${Math.floor(b.minLat / CELL)} AND ${Math.floor(b.maxLat / CELL)}` : sql``}
    ORDER BY bytes DESC LIMIT ${Math.min(f.limit ?? 400, 2000)}`;
  return rows.map((r) => ({ sourceId: r.source_id as string, tx: r.tx as number, ty: r.ty as number, url: r.url as string, bytes: r.bytes as number, routes: r.routes as number }));
}

const files = new Map<string, Promise<TileRoute[]>>();

/** One geometry file's routes, cached per process (files are immutable). */
function readTile(url: string): Promise<TileRoute[]> {
  let p = files.get(url);
  if (!p) {
    p = (url.startsWith("/") ? readFile(join(process.cwd(), "public", url), "utf8").then(JSON.parse) : fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json();
    })).then((j: { routes: TileRoute[] }) => j.routes);
    p.catch(() => files.delete(url));
    if (files.size > 2000) files.delete(files.keys().next().value!);
    files.set(url, p);
  }
  return p;
}

/** Encoded geometry pieces per route of one source, within a box when given. */
export async function routeShapes(sourceId: string, opts: { routeIds?: string[]; bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number } } = {}): Promise<Map<string, string[]>> {
  const tiles = await geoTiles({ sourceId, bbox: opts.bbox, limit: 2000 });
  const want = opts.routeIds ? new Set(opts.routeIds) : null;
  const out = new Map<string, string[]>();
  for (const routes of await Promise.all(tiles.map((t) => readTile(t.url)))) {
    for (const [id, , , , pieces] of routes) {
      if (want && !want.has(id)) continue;
      (out.get(id) ?? out.set(id, []).get(id)!).push(...pieces);
    }
  }
  return out;
}
