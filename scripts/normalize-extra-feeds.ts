// Rebuilds metadata of the feeds found by gen-extra-feeds.ts from authoritative data instead of feed ids:
// operator names and websites from the Transitland Atlas, location from the median stop (or vehicle) position,
// country by point-in-polygon on Natural Earth boundaries, city from the nearest Natural Earth populated place.
// Entries whose location cannot be established are dropped.
// Usage: bun scripts/normalize-extra-feeds.ts <transitland-atlas checkout> <dir with Natural Earth geojson>
//   Natural Earth files: ne_10m_admin_0_countries.geojson as countries.geojson, ne_10m_populated_places_simple.geojson as places.geojson
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectors } from "../src/connectors";
import { decodeFeed } from "../src/lib/gtfs-rt";
import { header, parseCsvLine } from "../src/lib/gtfs-static";
import { USER_AGENT } from "../src/lib/http";
import { RemoteZip } from "../src/lib/remote-zip";
import { REGION, slugify } from "./gen-global-gtfs";

const [atlasDir, neDir] = process.argv.slice(2);
if (!atlasDir || !neDir) throw new Error("usage: bun scripts/normalize-extra-feeds.ts <atlas dir> <natural earth dir>");

const SCHEDULE = new URL("../src/connectors/schedule/extra-feeds.json", import.meta.url).pathname;
const REALTIME = new URL("../src/connectors/global-gtfs/extra-feeds.json", import.meta.url).pathname;

type Ring = [number, number][];
interface Country { iso: string; bbox: [number, number, number, number]; polys: Ring[][] }
interface Entry { id: string; name: string; operator: string; country: string; city?: string; region: string; homepage: string; lat?: number; lon?: number; origin: string; static?: string[]; vehicles?: string[] }

// ---- Natural Earth ----
const geo = JSON.parse(readFileSync(join(neDir, "countries.geojson"), "utf8")) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] };
const countries: Country[] = geo.features.map((f) => {
  const p = f.properties;
  const iso = [p.ISO_A2, p.ISO_A2_EH, p.WB_A2].find((x) => x && /^[A-Z]{2}$/.test(x)) ?? "";
  const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
  const pts = polys.flat(2);
  const bbox: Country["bbox"] = [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
  return { iso: iso.toLowerCase(), bbox, polys };
}).filter((c) => c.iso);

function inRing(x: number, y: number, r: Ring) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function countryAt(lon: number, lat: number): string | undefined {
  for (const c of countries) {
    if (lon < c.bbox[0] || lon > c.bbox[2] || lat < c.bbox[1] || lat > c.bbox[3]) continue;
    if (c.polys.some((poly) => inRing(lon, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lon, lat, hole)))) return c.iso;
  }
  return undefined;
}

const places = (JSON.parse(readFileSync(join(neDir, "places.geojson"), "utf8")) as { features: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }[] })
  .features.map((f) => ({ name: f.properties.name, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));

function nearestPlace(lon: number, lat: number, maxKm = 60): string | undefined {
  let best: string | undefined;
  let bestD = maxKm;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const p of places) {
    const d = Math.hypot((p.lon - lon) * 111 * k, (p.lat - lat) * 111);
    if (d < bestD) {
      bestD = d;
      best = p.name;
    }
  }
  return best;
}

// ---- Transitland Atlas operators ----
const operatorOf = new Map<string, { name: string; website?: string }>();
const siblingsOf = new Map<string, string[]>();
for (const file of readdirSync(join(atlasDir, "feeds")).filter((f) => f.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(atlasDir, "feeds", file), "utf8")) as {
    feeds?: { id: string; urls?: { static_current?: string }; operators?: Op[] }[]; operators?: Op[];
  };
  type Op = { name?: string; website?: string; associated_feeds?: { feed_onestop_id?: string }[] };
  const feedUrl = new Map((d.feeds ?? []).map((f) => [f.id, f.urls?.static_current]));
  const ops: [Op, string[]][] = [
    ...(d.operators ?? []).map((o): [Op, string[]] => [o, (o.associated_feeds ?? []).map((a) => a.feed_onestop_id ?? "").filter(Boolean)]),
    ...(d.feeds ?? []).flatMap((f) => (f.operators ?? []).map((o): [Op, string[]] => [o, [f.id]])),
  ];
  for (const [o, feeds] of ops) {
    if (!o.name) continue;
    for (const id of feeds) operatorOf.set(id, { name: o.name, website: o.website });
    const statics = feeds.map((id) => feedUrl.get(id)).filter((u): u is string => !!u);
    for (const id of feeds) siblingsOf.set(id, statics);
  }
}

// ---- Feed contents ----
const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function fromStatic(url: string) {
  const zip = await RemoteZip.open(url, AbortSignal.timeout(60_000));
  let agency: { name?: string; url?: string } = {};
  const a = await zip.text("agency.txt");
  if (a) {
    const lines = a.split(/\r?\n/).filter(Boolean);
    const col = header(lines[0]);
    const f = parseCsvLine(lines[1] ?? "");
    agency = { name: f[col("agency_name")]?.trim(), url: f[col("agency_url")]?.trim() };
  }
  const lats: number[] = [];
  const lons: number[] = [];
  let col: ((n: string) => number) | undefined;
  for await (const line of zip.lines("stops.txt")) {
    if (!col) { col = header(line); continue; }
    const f = parseCsvLine(line);
    const lat = Number(f[col("stop_lat")]);
    const lon = Number(f[col("stop_lon")]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    lats.push(lat);
    lons.push(lon);
  }
  return { agency, lat: lats.length ? median(lats) : undefined, lon: lons.length ? median(lons) : undefined };
}

async function fromVehicles(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  const feed = decodeFeed(new Uint8Array(await r.arrayBuffer()));
  const pos = feed.entity.map((e) => e.vehicle?.position).filter((p) => p?.latitude && p.longitude);
  return pos.length ? { lat: median(pos.map((p) => p!.latitude)), lon: median(pos.map((p) => p!.longitude)) } : {};
}

const web = (u?: string) => {
  if (!u) return undefined;
  const v = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const url = new URL(v);
    // Download links are not homepages.
    return /download|\.zip$|\.pb$|gtfs/i.test(url.pathname) ? undefined : url.toString();
  } catch {
    return undefined;
  }
};

async function normalize(e: Entry, kind: "sched" | "gtfs"): Promise<Entry | null> {
  const onestop = e.origin.replace(/^transitland:/, "");
  const op = operatorOf.get(onestop);
  let lat: number | undefined, lon: number | undefined, agency: { name?: string; url?: string } = {};
  const statics = e.static?.length ? e.static : (siblingsOf.get(onestop) ?? []);
  for (const url of statics) {
    try {
      const s = await fromStatic(url);
      agency = s.agency;
      if (s.lat != null) ({ lat, lon } = s);
      if (lat != null) break;
    } catch {}
  }
  if (lat == null && e.vehicles?.length) {
    try {
      ({ lat, lon } = await fromVehicles(e.vehicles[0]));
    } catch {}
  }
  if (lat == null || lon == null) return null;
  const country = countryAt(lon, lat);
  const region = country && REGION[country.toUpperCase()];
  if (!country || !region) return null;
  const name = (op?.name || agency.name || e.name || "").trim();
  if (!name) return null;
  const city = nearestPlace(lon, lat);
  return {
    ...e,
    id: [kind, country, slugify(city ?? ""), slugify(name)].filter(Boolean).join("-"),
    name,
    operator: name,
    country,
    city,
    region,
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    homepage: web(op?.website) ?? web(agency.url) ?? `https://www.transit.land/feeds/${onestop}`,
  };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const rebuilt = new Set([SCHEDULE, REALTIME].flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as Entry[]).map((e) => e.id)));
const taken = new Set(connectors.map((c) => c.meta.id).filter((id) => !rebuilt.has(id)));

/** Same operator name in the same country within about 30 km: another catalog already lists this network. */
const known = connectors.filter((c) => !rebuilt.has(c.meta.id) && c.meta.lat != null).map((c) => ({ key: `${slugify(c.meta.name)}|${c.meta.country}`, lat: c.meta.lat!, lon: c.meta.lon! }));
const duplicate = (e: Entry) => known.some((k) => k.key === `${slugify(e.name)}|${e.country}` && Math.hypot(k.lat - e.lat!, k.lon - e.lon!) < 0.3);

for (const [file, kind] of [[SCHEDULE, "sched"], [REALTIME, "gtfs"]] as const) {
  const input = JSON.parse(readFileSync(file, "utf8")) as Entry[];
  let done = 0;
  const out = (await pool(input, 12, async (e) => {
    const r = await normalize(e, kind);
    if (++done % 50 === 0) console.log(`${kind}: ${done}/${input.length}`);
    return r;
  })).filter((e): e is Entry => !!e && !duplicate(e));
  for (const e of out.sort((a, b) => a.id.localeCompare(b.id))) {
    let id = e.id;
    for (let n = 2; taken.has(id); n++) id = `${e.id}-${n}`;
    taken.add(id);
    e.id = id;
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(`${file}.tmp`, `${JSON.stringify(out, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  const by: Record<string, number> = {};
  for (const e of out) by[e.country] = (by[e.country] ?? 0) + 1;
  console.log(`${kind}: kept ${out.length} of ${input.length}`, JSON.stringify(by));
}
