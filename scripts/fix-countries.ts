// Corrects the location, country and region of catalog-generated sources from where their stops actually are.
// Catalog country codes and bounding boxes are sometimes wrong (a cross-border service filed under its neighbour,
// a box spanning a border). For every source with imported stops, up to 400 stops are sampled from the database:
// the source moves to their median position, and to the country holding at least 60% of the stops that fall inside
// a country, or to "xx" (multi-country) when none does. Ids are left as they are, since they are persisted.
// Usage: bun scripts/fix-countries.ts <dir with Natural Earth countries.geojson and places.geojson>   (uses DATABASE_URL)
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { db } from "../src/db/client";
import { REGION } from "./gen-global-gtfs";
import { loadGeo } from "./lib/geo";

const neDir = process.argv[2];
if (!neDir) throw new Error("usage: bun scripts/fix-countries.ts <natural earth dir>");
const { countryAt } = loadGeo(neDir);
const SAMPLE = 400;
const MAJORITY = 0.6;

const sql = db();
const rows = await sql`SELECT source_id, lats, lons FROM stop_tiles`;
const pts = new Map<string, [number, number][]>();
for (const r of rows) {
  const list = pts.get(r.source_id as string) ?? pts.set(r.source_id as string, []).get(r.source_id as string)!;
  (r.lats as number[]).forEach((lat, i) => list.push([(r.lons as number[])[i], lat]));
}
await sql.end();

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function locate(list: [number, number][]) {
  const step = Math.max(1, Math.floor(list.length / SAMPLE));
  const sample = list.filter((_, i) => i % step === 0);
  const by = new Map<string, number>();
  for (const [lon, lat] of sample) {
    const c = countryAt(lon, lat);
    if (c) by.set(c, (by.get(c) ?? 0) + 1);
  }
  // Piers and small islands often fall outside the boundary polygons, so only resolved stops vote.
  const resolved = [...by.values()].reduce((a, b) => a + b, 0);
  const [top, n] = [...by].sort((a, b) => b[1] - a[1])[0] ?? [];
  const country = !resolved ? undefined : n! >= MAJORITY * resolved ? top : "xx";
  return { lon: median(sample.map((p) => p[0])), lat: median(sample.map((p) => p[1])), country };
}

const FILES = ["schedule/feeds.json", "schedule/extra-feeds.json", "schedule/more-feeds.json", "schedule/gap-feeds.json", "global-gtfs/feeds.json", "global-gtfs/extra-feeds.json", "global-gtfs/more-feeds.json", "global-gtfs/gap-feeds.json"]
  .map((f) => new URL(`../src/connectors/${f}`, import.meta.url).pathname);

for (const file of FILES) {
  const list = JSON.parse(readFileSync(file, "utf8")) as { id: string; country: string; region: string; lat?: number; lon?: number }[];
  let moved = 0;
  for (const e of list) {
    const stops = pts.get(e.id);
    if (!stops?.length) continue;
    const at = locate(stops);
    e.lat = Math.round(at.lat * 1e4) / 1e4;
    e.lon = Math.round(at.lon * 1e4) / 1e4;
    if (!at.country || at.country === e.country) continue;
    const region = at.country === "xx" ? e.region : REGION[at.country.toUpperCase()];
    if (!region) continue;
    console.log(`${e.id}: ${e.country} -> ${at.country}`);
    e.country = at.country;
    e.region = region;
    moved++;
  }
  writeFileSync(`${file}.tmp`, `${JSON.stringify(list, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  console.log(`${file.split("/connectors/")[1]}: ${moved} moved`);
}
