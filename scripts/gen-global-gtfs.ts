// Generates src/connectors/global-gtfs/feeds.json from the MobilityData Mobility Database catalog.
// Run: bun scripts/gen-global-gtfs.ts
import { writeFileSync } from "node:fs";
import { decodeFeed } from "../src/lib/gtfs-rt";
import { USER_AGENT } from "../src/lib/http";
import type { Mode, Region } from "../src/lib/types";

const CATALOG = "https://files.mobilitydatabase.org/feeds_v2.csv";
const OUT = new URL("../src/connectors/global-gtfs/feeds.json", import.meta.url).pathname;
const MAX_SOURCES = 250;
const CONCURRENCY = 20;
const TIMEOUT_MS = 15_000;
const MAX_VEHICLE_AGE_S = 2 * 3600;
const MAX_ALERT_HEADER_AGE_S = 7 * 86400;

/** Providers curated by hand elsewhere, matched against provider name or feed URL. */
const EXCLUDED = [
  /mta|metropolitan transportation authority|new york city transit/i,
  /mbta|massachusetts bay/i,
  /\bbart\b|bay area rapid/i,
  /septa|southeastern pennsylvania/i,
  /\bcta\b|chicago transit|transitchicago/i,
  /\bttc\b|toronto transit|ttc\.ca/i,
  /\bstm\b|stm\.info|société de transport de montréal|societe de transport de montreal/i,
  /\btfl\b|transport for london|tfl\.gov/i,
  /renfe/i,
  /translink|gtfsrt\.api\.translink\.com\.au/i,
  /adelaide ?metro|adelaidemetro/i,
  /data\.gov\.my|rapid ?(kl|bus|rail)|ktmb|prasarana/i,
  /ovapi|openov|\bov\b ?api/i,
  /entur/i,
  /edmonton transit|halifax transit|hamilton street railway|calgary transit/i,
  /regional transportation district|metropolitan atlanta rapid|^metro transit$|king county metro|capital metro|nyc ferry/i,
  /helsingin seudun|roma servizi/i,
];

const REGION: Record<string, Region> = {};
const assign = (r: Region, codes: string) => codes.split(" ").forEach((c) => (REGION[c] = r));
assign("north-america", "US CA");
assign("latam", "MX GT BZ HN SV NI CR PA CU DO HT JM PR TT BB CO VE EC PE BR BO PY UY AR CL GY SR");
assign("europe", "AT BE BG CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK UA BY AL BA XK AD SM RU GE AM AZ");
assign("asia", "JP KR CN TW HK MO MN KP IN LK BD NP BT PK AF MM TH LA KH VN MY SG ID PH BN TL KZ UZ KG TJ TM MV");
assign("oceania", "AU NZ FJ PG NC PF WS TO VU SB GU");
assign("middle-east", "TR IL PS JO LB SY IQ IR SA AE QA KW BH OM YE");
assign("africa", "ZA EG MA DZ TN LY NG GH KE TZ UG ET RW SN CI CM AO MZ ZW ZM BW NA MU MG DZ SD SS CD CG GA ML BF NE TD MR GM GN SL LR TG BJ");

type Row = Record<string, string>;

function parseCsv(s: string): Row[] {
  const rows: string[][] = [];
  let r: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      r.push(f);
      f = "";
    } else if (c === "\n") {
      r.push(f);
      rows.push(r);
      r = [];
      f = "";
    } else if (c !== "\r") f += c;
  }
  const head = rows[0];
  return rows.slice(1).map((v) => Object.fromEntries(head.map((k, i) => [k, v[i] ?? ""])));
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferModes(text: string): Mode[] {
  const t = text.toLowerCase();
  const m = new Set<Mode>();
  if (/\b(metro|subway|underground|u-?bahn|mrt|lrt)\b/.test(t)) m.add("metro");
  if (/\b(tram|streetcar|trolley|light rail|straßenbahn)\b/.test(t)) m.add("tram");
  if (/\b(rail|railway|railroad|train|s-?bahn|commuter|cercanias|ferrovi|zug|bahn)\b/.test(t)) m.add("rail");
  if (/\b(ferry|ferries|boat|water)\b/.test(t)) m.add("ferry");
  if (/\b(cable|gondola|funicular|telef)\b/.test(t)) m.add("cable");
  if (/\b(bus|buses|autobus|coach|transit)\b/.test(t) || m.size === 0) m.add("bus");
  return [...m];
}

const bbCenter = (r: Row) => {
  const n = (k: string) => Number.parseFloat(r[`location.bounding_box.${k}`]);
  const [a, b, c, d] = [n("minimum_latitude"), n("maximum_latitude"), n("minimum_longitude"), n("maximum_longitude")];
  if (![a, b, c, d].every(Number.isFinite)) return undefined;
  return { lat: +((a + b) / 2).toFixed(4), lon: +((c + d) / 2).toFixed(4) };
};

interface Candidate {
  url: string;
  kind: "alerts" | "vehicles";
  row: Row;
}
interface Probe {
  ok: boolean;
  vehicles: number;
}

async function probe(c: Candidate): Promise<Probe> {
  try {
    const res = await fetch(c.url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, vehicles: 0 };
    const feed = decodeFeed(new Uint8Array(await res.arrayBuffer()));
    const now = Date.now() / 1000;
    const header = Number(feed.header?.timestamp ?? 0);
    if (c.kind === "alerts") {
      if (header && now - header > MAX_ALERT_HEADER_AGE_S) return { ok: false, vehicles: 0 };
      return { ok: true, vehicles: 0 };
    }
    const withPos = feed.entity.filter((e) => e.vehicle?.position?.latitude && e.vehicle.position.longitude);
    if (!withPos.length) return { ok: false, vehicles: 0 };
    const stamps = [header, ...withPos.map((e) => Number(e.vehicle?.timestamp ?? 0))].filter((x) => x > 0);
    const latest = Math.max(0, ...stamps);
    if (!latest || now - latest > MAX_VEHICLE_AGE_S) return { ok: false, vehicles: 0 };
    return { ok: true, vehicles: withPos.length };
  } catch {
    return { ok: false, vehicles: 0 };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

interface Entry {
  id: string;
  name: string;
  operator: string;
  country: string;
  city?: string;
  region: Region;
  modes: Mode[];
  homepage: string;
  lat?: number;
  lon?: number;
  license?: string;
  alerts: string[];
  vehicles: string[];
  vehicleCount: number;
}

async function main() {
  const csv = await (await fetch(CATALOG)).text();
  const catalog = parseCsv(csv);
  const rt = catalog.filter((r) => r.data_type === "gtfs_rt");

  const cands: Candidate[] = [];
  const seen = new Set<string>();
  for (const row of rt) {
    if (row["urls.authentication_type"] !== "0" || row.status !== "active") continue;
    const url = row["urls.direct_download"];
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
    const types = row.entity_type.split("|");
    const kind = types.includes("vp") ? "vehicles" : types.includes("sa") ? "alerts" : undefined;
    if (!kind) continue;
    if (EXCLUDED.some((re) => re.test(row.provider) || re.test(url))) continue;
    seen.add(url);
    cands.push({ url, kind, row });
  }
  console.log(`catalog rows ${catalog.length}, gtfs_rt ${rt.length}, candidates ${cands.length}`);

  const results = await pool(cands, CONCURRENCY, probe);
  const passed = cands.map((c, i) => ({ c, p: results[i] })).filter((x) => x.p.ok);
  console.log(`probed ${cands.length}, passed ${passed.length}`);

  const groups = new Map<string, Entry>();
  for (const { c, p } of passed) {
    const r = c.row;
    const country = r["location.country_code"].toLowerCase();
    if (!/^[a-z]{2}$/.test(country)) continue;
    const region = REGION[country.toUpperCase()];
    if (!region) continue;
    const key = [country, r["location.municipality"], r.provider].join("|");
    let g = groups.get(key);
    if (!g) {
      const center = bbCenter(r);
      const name = slugify(r.provider) || slugify(r.id.replace(/-(vp|sa|tu)$/, ""));
      const id = ["gtfs", country, slugify(r["location.municipality"]), name].filter(Boolean).join("-");
      g = {
        id,
        name: r.provider,
        operator: r.provider,
        country,
        city: r["location.municipality"] || undefined,
        region,
        modes: [],
        homepage: new URL(c.url).origin,
        lat: center?.lat,
        lon: center?.lon,
        license: r["urls.license"].startsWith("http") ? r["urls.license"] : undefined,
        alerts: [],
        vehicles: [],
        vehicleCount: 0,
      };
      groups.set(key, g);
    }
    (c.kind === "alerts" ? g.alerts : g.vehicles).push(c.url);
    g.vehicleCount += p.vehicles;
    g.modes = [...new Set([...g.modes, ...inferModes(`${r.name} ${r.provider}`)])];
  }

  const all = [...groups.values()];
  const used = new Set<string>();
  for (const e of all.sort((a, b) => a.id.localeCompare(b.id))) {
    let id = e.id;
    for (let n = 2; used.has(id); n++) id = `${e.id}-${n}`;
    used.add(id);
    e.id = id;
  }

  // Country diversity first (largest group per country), then the rest by size.
  const bySize = [...all].sort((a, b) => b.vehicleCount - a.vehicleCount || a.id.localeCompare(b.id));
  const picked = new Set<Entry>();
  for (const e of bySize) if (![...picked].some((p) => p.country === e.country)) picked.add(e);
  for (const e of bySize) if (picked.size < MAX_SOURCES) picked.add(e);
  const shipped = [...picked].sort((a, b) => a.id.localeCompare(b.id));

  writeFileSync(OUT, `${JSON.stringify(shipped, null, 2)}\n`);

  const count = (f: (e: Entry) => string) => {
    const m: Record<string, number> = {};
    for (const e of shipped) m[f(e)] = (m[f(e)] ?? 0) + 1;
    return m;
  };
  console.log(`groups ${all.length}, shipped ${shipped.length}`);
  console.log("per region", count((e) => e.region));
  console.log("per country", count((e) => e.country));
}

await main();
