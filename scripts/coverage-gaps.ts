// Lists first-level administrative regions (states, provinces, regions) with no imported stops, per country, to
// guide source discovery toward places the registries do not reach yet. Each stop tile is counted in the region
// containing its first stop, using Natural Earth admin-1 boundaries (ne_10m_admin_1_states_provinces).
// Usage: bun scripts/coverage-gaps.ts <admin1.geojson> [out.json]   (uses DATABASE_URL)
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../src/db/client";

const [file, out = "coverage-gaps.json"] = process.argv.slice(2);
if (!file) throw new Error("usage: bun scripts/coverage-gaps.ts <admin1.geojson> [out.json]");

type Ring = [number, number][];
interface Region { name: string; country: string; type: string; bbox: [number, number, number, number]; polys: Ring[][]; stops: number }

const geo = JSON.parse(readFileSync(file, "utf8")) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } | null }[] };
const regions: Region[] = geo.features.filter((f) => f.geometry).map((f) => {
  const polys = (f.geometry!.type === "Polygon" ? [f.geometry!.coordinates] : f.geometry!.coordinates) as Ring[][];
  const pts = polys.flat(2);
  return {
    name: f.properties.name ?? f.properties.name_en ?? "?",
    country: (f.properties.iso_a2 ?? "").toLowerCase(),
    type: f.properties.type_en ?? "",
    bbox: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
    polys,
    stops: 0,
  };
});

function inRing(x: number, y: number, r: Ring) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const regionAt = (lon: number, lat: number) =>
  regions.find((r) => lon >= r.bbox[0] && lon <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3]
    && r.polys.some((p) => inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h))));

const sql = db();
const tiles = await sql`SELECT lats[1] AS lat, lons[1] AS lon, cardinality(lats) AS n FROM stop_tiles`;
await sql.end();
for (const t of tiles) {
  const r = regionAt(t.lon as number, t.lat as number);
  if (r) r.stops += Number(t.n);
}

const byCountry = new Map<string, { covered: number; total: number; gaps: string[] }>();
for (const r of regions) {
  if (!/^[a-z]{2}$/.test(r.country)) continue;
  const c = byCountry.get(r.country) ?? byCountry.set(r.country, { covered: 0, total: 0, gaps: [] }).get(r.country)!;
  c.total++;
  if (r.stops) c.covered++;
  else c.gaps.push(r.type ? `${r.name} (${r.type})` : r.name);
}
const report = Object.fromEntries([...byCountry].sort((a, b) => b[1].gaps.length - a[1].gaps.length));
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
const gaps = [...byCountry.values()].reduce((n, c) => n + c.gaps.length, 0);
console.log(`${tiles.length} stop tiles; ${regions.length - gaps} of ${regions.length} regions have stops; ${[...byCountry.values()].filter((c) => !c.covered).length} countries have none`);
