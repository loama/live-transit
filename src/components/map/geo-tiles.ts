import type { MapRoute } from "./transit-layers";

// Client side of the route geometry files: ask the API which files cover a box, fetch them from the CDN
// (immutable, so each is fetched once per page), and merge their pieces into one entry per route.

type TileRoute = [string, string, string, string | null, string[]];
interface TileRef { sourceId: string; url: string }

const files = new Map<string, Promise<{ sourceId: string; routes: TileRoute[] }>>();

function tile(url: string) {
  let p = files.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
    p.catch(() => files.delete(url));
    files.set(url, p);
  }
  return p;
}

/** `bbox` as minLon,minLat,maxLon,maxLat. Adds the routes found to `into`, keyed by source and route id. */
export async function loadGeo(bbox: string, into: Map<string, MapRoute>, opts: { sourceId?: string; routeId?: string; signal?: AbortSignal } = {}) {
  const qs = new URLSearchParams({ bbox, limit: "600" });
  if (opts.sourceId) qs.set("sourceId", opts.sourceId);
  const r = await fetch(`/api/v1/geo?${qs}`, { signal: opts.signal });
  if (!r.ok) return;
  const refs = (await r.json()).data as TileRef[];
  const loaded = await Promise.all(refs.map((t) => tile(t.url).catch(() => null)));
  for (const f of loaded) {
    if (!f) continue;
    for (const [routeId, name, mode, color, pieces] of f.routes) {
      if (opts.routeId && routeId !== opts.routeId) continue;
      const key = `${f.sourceId}|${routeId}`;
      const cur = into.get(key);
      if (cur) {
        for (const p of pieces) if (!cur.shapes!.includes(p)) cur.shapes!.push(p);
      } else into.set(key, { sourceId: f.sourceId, routeId, name, mode, color, shapes: [...pieces] });
    }
  }
}

/** A map's bounds rounded outward to 0.1 degree, so nearby views share cached index responses. */
export function roundedBbox(b: { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number }) {
  const f = (n: number) => Math.floor(n * 10) / 10;
  const c = (n: number) => Math.ceil(n * 10) / 10;
  return [f(Math.max(-180, b.getWest())), f(Math.max(-90, b.getSouth())), c(Math.min(180, b.getEast())), c(Math.min(90, b.getNorth()))].join(",");
}
