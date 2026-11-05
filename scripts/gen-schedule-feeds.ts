// Generates src/connectors/schedule/feeds.json from MobilityData static GTFS feeds.
// Run: bun scripts/gen-schedule-feeds.ts
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { parseCsv, slugify, REGION } from "./gen-global-gtfs";
import { parseRoutes, header, parseCsvLine } from "../src/lib/gtfs-static";
import { RemoteZip } from "../src/lib/remote-zip";
import type { Mode, Region } from "../src/lib/types";

const CATALOG = "https://files.mobilitydatabase.org/feeds_v2.csv";
const OUT = new URL("../src/connectors/schedule/feeds.json", import.meta.url).pathname;
const CACHE = new URL("../src/connectors/schedule/.validation-cache.json", import.meta.url).pathname;
const STATIC_GTFS = new URL("../src/connectors/static-gtfs.json", import.meta.url).pathname;
const GLOBAL_GTFS = new URL("../src/connectors/global-gtfs/feeds.json", import.meta.url).pathname;
const CONCURRENCY = 16;
const TIMEOUT_MS = 30_000;

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
  static: string[];
  origin: string;
}

interface Candidate {
  url: string;
  row: Record<string, string>;
}

type ValidationResult =
  | { ok: true; modes: Mode[]; agencyUrl?: string; lat?: number; lon?: number }
  | { ok: false; reason: string };

async function extractAgencyUrl(zip: RemoteZip): Promise<string | undefined> {
  try {
    const agencyCsv = await zip.text("agency.txt");
    if (!agencyCsv) return undefined;
    const lines = agencyCsv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return undefined;
    const col = header(lines[0]);
    const urlIdx = col("agency_url");
    if (urlIdx < 0) return undefined;
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const url = fields[urlIdx]?.trim();
      if (url && /^https?:\/\//.test(url)) return url;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function extractMedianStop(zip: RemoteZip): Promise<{ lat?: number; lon?: number }> {
  try {
    const lats: number[] = [];
    const lons: number[] = [];
    let col: ((n: string) => number) | undefined;
    let latIdx = -1;
    let lonIdx = -1;
    for await (const line of zip.lines("stops.txt")) {
      if (!col) {
        col = header(line);
        latIdx = col("stop_lat");
        lonIdx = col("stop_lon");
        if (latIdx < 0 || lonIdx < 0) break;
        continue;
      }
      const fields = parseCsvLine(line);
      const lat = Number(fields[latIdx]);
      const lon = Number(fields[lonIdx]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0) {
        lats.push(lat);
        lons.push(lon);
      }
    }
    if (lats.length === 0) return {};
    lats.sort((a, b) => a - b);
    lons.sort((a, b) => a - b);
    const midLat = lats[Math.floor(lats.length / 2)];
    const midLon = lons[Math.floor(lons.length / 2)];
    return { lat: +midLat.toFixed(4), lon: +midLon.toFixed(4) };
  } catch {
    return {};
  }
}

async function validate(c: Candidate): Promise<ValidationResult> {
  try {
    const zip = await RemoteZip.open(c.url, AbortSignal.timeout(TIMEOUT_MS));
    const routesCsv = await zip.text("routes.txt");
    if (!routesCsv) return { ok: false, reason: "no routes.txt" };
    const routes = parseRoutes(routesCsv);
    if (routes.length === 0) return { ok: false, reason: "zero routes" };
    const modes = [...new Set(routes.map((r) => r.mode))].filter((m) => m !== "other");
    if (modes.length === 0) {
      const hasOther = routes.some((r) => r.mode === "other");
      if (!hasOther) return { ok: false, reason: "no valid modes" };
    }
    const finalModes = modes.length > 0 ? modes : ["other" as Mode];
    const agencyUrl = await extractAgencyUrl(zip);
    const { lat, lon } = await extractMedianStop(zip);
    return { ok: true, modes: finalModes, agencyUrl, lat, lon };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) return { ok: false, reason: "timeout" };
    if (msg.includes("Range") || msg.includes("ignores Range")) return { ok: false, reason: "no range support" };
    if (msg.includes("HTTP")) return { ok: false, reason: "http error" };
    if (msg.includes("not found")) return { ok: false, reason: "file not found" };
    return { ok: false, reason: "validation error" };
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

const bbCenter = (r: Record<string, string>) => {
  const n = (k: string) => Number.parseFloat(r[`location.bounding_box.${k}`]);
  const [a, b, c, d] = [n("minimum_latitude"), n("maximum_latitude"), n("minimum_longitude"), n("maximum_longitude")];
  if (![a, b, c, d].every(Number.isFinite)) return undefined;
  return { lat: +((a + b) / 2).toFixed(4), lon: +((c + d) / 2).toFixed(4) };
};

async function main() {
  const csv = await (await fetch(CATALOG)).text();
  const catalog = parseCsv(csv);
  const staticFeeds = catalog.filter((r) => r.data_type === "gtfs" && (!r.status || r.status === "active"));

  const staticGtfs: Record<string, { urls: string[] }> = JSON.parse(readFileSync(STATIC_GTFS, "utf8"));
  const coveredUrls = new Set<string>();
  for (const { urls } of Object.values(staticGtfs)) {
    for (const u of urls) coveredUrls.add(u);
  }

  const globalGtfs: Array<{ id: string; static?: string[] }> = JSON.parse(readFileSync(GLOBAL_GTFS, "utf8"));
  const staticReferences = new Set<string>();
  for (const feed of globalGtfs) {
    if (feed.static) {
      for (const u of feed.static) staticReferences.add(u);
    }
  }

  const cands: Candidate[] = [];
  for (const row of staticFeeds) {
    if (row["urls.authentication_type"] !== "0") continue;
    const url = row["urls.latest"] || row["urls.direct_download"];
    if (!/^https?:\/\//.test(url)) continue;
    if (coveredUrls.has(url) || staticReferences.has(url)) continue;
    cands.push({ url, row });
  }

  console.log(`catalog rows ${catalog.length}, static gtfs ${staticFeeds.length}, candidates ${cands.length}`);

  const cache: Record<string, ValidationResult> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  let cached = 0;
  const results = await pool(
    cands,
    CONCURRENCY,
    async (c) => {
      if (cache[c.url]) {
        cached++;
        if (cached % 100 === 0) process.stdout.write(`\rcached ${cached}/${cands.length}`);
        return cache[c.url];
      }
      const res = await validate(c);
      cache[c.url] = res;
      if ((cands.indexOf(c) - cached) % 10 === 0) {
        process.stdout.write(`\rvalidated ${cands.indexOf(c) + 1 - cached}/${cands.length - cached}, cached ${cached}`);
      }
      return res;
    },
  );
  writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  console.log(`\nvalidated ${cands.length - cached}, cached ${cached}`);

  const failureReasons: Record<string, number> = {};
  const passed: Array<{ c: Candidate; result: ValidationResult & { ok: true } }> = [];
  for (let i = 0; i < cands.length; i++) {
    const r = results[i];
    if (r.ok) {
      passed.push({ c: cands[i], result: r });
    } else {
      failureReasons[r.reason] = (failureReasons[r.reason] ?? 0) + 1;
    }
  }

  console.log(`passed ${passed.length}`);

  const entries: Entry[] = [];
  let droppedNoCoords = 0;
  for (const { c, result } of passed) {
    const r = c.row;
    const country = r["location.country_code"].toLowerCase();
    if (!/^[a-z]{2}$/.test(country)) continue;
    const region = REGION[country.toUpperCase()];
    if (!region) {
      console.warn(`missing region for country ${country.toUpperCase()}`);
      continue;
    }
    const center = bbCenter(r);
    const lat = result.lat ?? center?.lat;
    const lon = result.lon ?? center?.lon;
    if (lat === undefined || lon === undefined) {
      droppedNoCoords++;
      continue;
    }
    const provider = r.provider || "transit";
    const feedName = r.name || "";
    const municipality = r["location.municipality"] || r["location.subdivision_name"] || "";
    const citySlug = slugify(municipality);
    const providerSlug = slugify(provider);
    const name = provider === feedName || !feedName ? provider : `${provider} ${feedName}`;
    const idBase = ["sched", country, citySlug, providerSlug].filter(Boolean).join("-");

    const mdbId = r.id;
    const catalogPage = `https://mobilitydatabase.org/feeds/gtfs/${mdbId}`;
    const homepage = result.agencyUrl || catalogPage;

    entries.push({
      id: idBase,
      name,
      operator: provider,
      country,
      city: municipality || undefined,
      region,
      modes: result.modes,
      homepage,
      lat,
      lon,
      license: r["urls.license"]?.startsWith("http") ? r["urls.license"] : undefined,
      static: [c.url],
      origin: `mobilitydatabase:${mdbId}`,
    });
  }
  if (droppedNoCoords > 0) console.log(`dropped ${droppedNoCoords} entries with no coordinates`);

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const used = new Set<string>();
  for (const e of entries) {
    let id = e.id;
    if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(id)) {
      console.warn(`invalid id format: ${id}, fixing`);
      id = id.replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-").replace(/^-+|-+$/g, "");
    }
    for (let n = 2; used.has(id); n++) id = `${e.id}-${n}`;
    used.add(id);
    e.id = id;
  }

  writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`);

  const perCountry: Record<string, number> = {};
  const perRegion: Record<string, number> = {};
  for (const e of entries) {
    perCountry[e.country] = (perCountry[e.country] ?? 0) + 1;
    perRegion[e.region] = (perRegion[e.region] ?? 0) + 1;
  }

  console.log(`\nscheduled feeds: ${entries.length}`);
  console.log("\nper region:", perRegion);
  const topCountries = Object.entries(perCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);
  console.log("\ntop 40 countries:", Object.fromEntries(topCountries));
  console.log("\nfailure reasons:", failureReasons);
}

if (import.meta.main) await main();
