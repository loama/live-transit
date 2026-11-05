import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type postgres from "postgres";
import { decodePolyline, encodePolyline, type Point } from "@/lib/polyline";

// Route geometry lives outside Postgres, as one JSON file per source per grid cell on blob storage (or under
// public/ in development). Files are immutable and never overwritten: each import writes new ones, swaps the
// geo_tiles index in one transaction, then deletes the old files. Maps read the index for a viewport and fetch
// the files straight from the CDN.

/** Cell edge in degrees, about 55 km of latitude. */
export const GEO_CELL = 0.5;

/** A route's geometry within one cell: [routeId, name, mode, color, encoded pieces]. */
export type TileRoute = [string, string, string, string | null, string[]];
export interface GeoTile { tx: number; ty: number; routes: TileRoute[] }

export interface GeoRoute { routeId: string; name: string; mode: string; color: string | null; shapes: string[] }

const cellOf = ([lon, lat]: Point) => [Math.floor(lon / GEO_CELL), Math.floor(lat / GEO_CELL)] as const;

/**
 * Cut every shape into pieces per cell: each segment belongs to the cell of its midpoint, and a piece keeps the
 * previous point so pieces join up on the map. A long line lands in each cell it crosses exactly once.
 */
export function buildTiles(routes: GeoRoute[]): GeoTile[] {
  const tiles = new Map<string, Map<string, TileRoute>>();
  for (const r of routes) {
    for (const s of r.shapes) {
      const pts = decodePolyline(s);
      let piece: Point[] = [];
      let key = "";
      const flush = () => {
        if (piece.length < 2) return;
        const t = tiles.get(key) ?? tiles.set(key, new Map()).get(key)!;
        const entry = t.get(r.routeId) ?? t.set(r.routeId, [r.routeId, r.name, r.mode, r.color, []]).get(r.routeId)!;
        entry[4].push(encodePolyline(piece));
      };
      for (let i = 1; i < pts.length; i++) {
        const [tx, ty] = cellOf([(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2]);
        const k = `${tx}_${ty}`;
        if (k !== key) {
          flush();
          key = k;
          piece = [pts[i - 1]];
        }
        piece.push(pts[i]);
      }
      flush();
    }
  }
  return [...tiles].map(([k, m]) => {
    const [tx, ty] = k.split("_").map(Number);
    return { tx, ty, routes: [...m.values()] };
  });
}

export interface GeoStore {
  put(path: string, body: string): Promise<string>;
  del(urls: string[]): Promise<void>;
}

/** Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else files under public/geo served by Next itself. */
export async function geoStore(): Promise<GeoStore> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put, del } = await import("@vercel/blob");
    return {
      put: async (path, body) =>
        (await put(path, body, { access: "public", contentType: "application/json", addRandomSuffix: true, cacheControlMaxAge: 31_536_000 })).url,
      del: async (urls) => {
        for (let i = 0; i < urls.length; i += 500) await del(urls.slice(i, i + 500));
      },
    };
  }
  const root = join(process.cwd(), "public");
  return {
    async put(path, body) {
      const rel = `/${path.replace(/\.json$/, "")}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.json`;
      await mkdir(dirname(join(root, rel)), { recursive: true });
      await writeFile(join(root, rel), body);
      return rel;
    },
    async del(urls) {
      for (const u of urls) if (u.startsWith("/geo/")) await rm(join(root, u), { force: true });
    },
  };
}

/** Publish a source's geometry and swap its tile index. Returns the number of tiles written. */
export async function publishGeo(sql: postgres.Sql, sourceId: string, routes: GeoRoute[], store?: GeoStore): Promise<number> {
  const s = store ?? (await geoStore());
  const tiles = buildTiles(routes);
  const written: { source_id: string; tx: number; ty: number; url: string; bytes: number; routes: number }[] = [];
  for (let i = 0; i < tiles.length; i += 16) {
    written.push(...(await Promise.all(tiles.slice(i, i + 16).map(async (t) => {
      const body = JSON.stringify({ sourceId, routes: t.routes });
      const url = await s.put(`geo/v1/${sourceId}/${t.tx}_${t.ty}.json`, body);
      return { source_id: sourceId, tx: t.tx, ty: t.ty, url, bytes: body.length, routes: t.routes.length };
    }))));
  }
  const old = await sql.begin(async (tx) => {
    const prev = (await tx`DELETE FROM geo_tiles WHERE source_id = ${sourceId} RETURNING url`).map((r) => r.url as string);
    for (let i = 0; i < written.length; i += 500) await tx`INSERT INTO geo_tiles ${tx(written.slice(i, i + 500) as never)}`;
    return prev;
  });
  if (old.length) await s.del(old).catch((e) => console.warn(`[geo] could not delete ${old.length} old tiles of ${sourceId}:`, (e as Error).message));
  return written.length;
}
