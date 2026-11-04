// Applies the hand-verified metadata corrections in batch-*.json to the generated feed list.
// Row: [oldKey, newKey|null, name, operator, city, modes, homepage, lat, lon, country?]
// oldKey/newKey are ids without the "gtfs-" prefix; modes is a letter string (see MODE_LETTERS);
// null keeps the generated value. Entries that end up with the same id are merged.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = new URL("./", import.meta.url).pathname;
const FEEDS = new URL("../../src/connectors/global-gtfs/feeds.json", import.meta.url).pathname;
const MODE_LETTERS: Record<string, string> = { b: "bus", t: "tram", m: "metro", r: "rail", f: "ferry", c: "cable" };

type Row = [string, string | null, string | null, string | null, string | null, string | null, string | null, number | null, number | null, string?];
interface Feed {
  id: string;
  name: string;
  operator: string;
  country: string;
  city?: string;
  modes: string[];
  homepage: string;
  lat?: number;
  lon?: number;
  alerts: string[];
  vehicles: string[];
  vehicleCount: number;
}

export function loadFixes(): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const f of readdirSync(DIR).filter((n) => /^batch-.*\.json$/.test(n)).sort()) {
    for (const row of JSON.parse(readFileSync(DIR + f, "utf8")) as Row[]) {
      map.set(row[0], row);
      if (row[1]) map.set(row[1], row);
    }
  }
  return map;
}

export function applyFixes<T extends Feed>(feeds: T[]): T[] {
  const fixes = loadFixes();
  const out = new Map<string, T>();
  for (const f of feeds) {
    const r = fixes.get(f.id.replace(/^gtfs-/, ""));
    if (r) {
      const [, newKey, name, operator, city, modes, homepage, lat, lon, country] = r;
      if (newKey) f.id = `gtfs-${newKey}`;
      if (name) f.name = name;
      if (operator) f.operator = operator;
      if (city) f.city = city;
      if (modes) (f as Feed).modes = [...modes].map((m) => MODE_LETTERS[m]);
      if (homepage) f.homepage = homepage;
      if (lat != null) f.lat = lat;
      if (lon != null) f.lon = lon;
      if (country) f.country = country;
    }
    const prev = out.get(f.id);
    if (prev) {
      prev.alerts = [...new Set([...prev.alerts, ...f.alerts])];
      prev.vehicles = [...new Set([...prev.vehicles, ...f.vehicles])];
      prev.vehicleCount += f.vehicleCount;
      (prev as Feed).modes = [...new Set([...prev.modes, ...f.modes])];
    } else out.set(f.id, f);
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

if (import.meta.main) {
  const feeds = JSON.parse(readFileSync(FEEDS, "utf8")) as Feed[];
  const fixed = applyFixes(feeds);
  writeFileSync(FEEDS, `${JSON.stringify(fixed, null, 2)}\n`);
  console.log(`feeds ${feeds.length} -> ${fixed.length}`);
}
