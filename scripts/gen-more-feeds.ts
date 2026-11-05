import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { RemoteZip } from "../src/lib/remote-zip";
import { parseRoutes, header, parseCsvLine } from "../src/lib/gtfs-static";
import { decodeFeed } from "../src/lib/gtfs-rt";
import { loadGeo } from "./lib/geo";
import { REGION, slugify, parseCsv } from "./gen-global-gtfs";
import { USER_AGENT } from "../src/lib/http";
import type { Mode, Region } from "../src/lib/types";

const RETRY_MODE = process.env.RETRY_MODE === "1";
const CONCURRENCY = RETRY_MODE ? 6 : 16;
const TIMEOUT_MS = 30_000;
const CANDIDATE_TIMEOUT_MS = RETRY_MODE ? 300_000 : 90_000;
const MAX_VEHICLE_AGE_S = 2 * 3600;
const MAX_ALERT_HEADER_AGE_S = 7 * 86400;

const SCHED_OUT = new URL("../src/connectors/schedule/more-feeds.json", import.meta.url).pathname;
const RT_OUT = new URL("../src/connectors/global-gtfs/more-feeds.json", import.meta.url).pathname;
const TIMEOUT_LOG = "/tmp/gen-more-feeds-timeouts.json";

interface SchedEntry {
  id: string;
  name: string;
  operator: string;
  country: string;
  city?: string;
  region: Region;
  modes: Mode[];
  homepage: string;
  lat: number;
  lon: number;
  license?: string;
  static: string[];
  origin: string;
}

interface RTEntry {
  id: string;
  name: string;
  operator: string;
  country: string;
  city?: string;
  region: Region;
  modes: Mode[];
  homepage: string;
  lat: number;
  lon: number;
  license?: string;
  alerts: string[];
  vehicles: string[];
  vehicleCount: number;
  static?: string[];
}

interface Candidate {
  name: string;
  operator: string;
  homepage: string;
  license?: string;
  staticUrls: string[];
  alertsUrls: string[];
  vehiclesUrls: string[];
  origin: string;
}

type ValidationResult = { type: "sched"; entry: SchedEntry } | { type: "rt"; entry: RTEntry } | null;

const geo = loadGeo("/tmp/ne");

async function pool<T, R>(items: T[], n: number, fn: (x: T, idx: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
        done++;
        if (done % 50 === 0) console.log(`processed ${done}/${items.length}`);
      }
    })
  );
  return out;
}

async function medianStopPosition(zip: RemoteZip): Promise<{ lat: number; lon: number } | null> {
  try {
    const lats: number[] = [];
    const lons: number[] = [];
    let headerParsed = false;
    let latIdx = -1;
    let lonIdx = -1;

    for await (const line of zip.lines("stops.txt")) {
      if (!headerParsed) {
        const col = header(line);
        latIdx = col("stop_lat");
        lonIdx = col("stop_lon");
        if (latIdx < 0 || lonIdx < 0) return null;
        headerParsed = true;
        continue;
      }
      const f = parseCsvLine(line);
      const lat = parseFloat(f[latIdx]);
      const lon = parseFloat(f[lonIdx]);
      if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0 && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        lats.push(lat);
        lons.push(lon);
      }
    }

    if (lats.length === 0) return null;
    lats.sort((a, b) => a - b);
    lons.sort((a, b) => a - b);
    const mid = Math.floor(lats.length / 2);
    return { lat: lats[mid], lon: lons[mid] };
  } catch {
    return null;
  }
}

async function validateStatic(url: string, signal: AbortSignal): Promise<{ routes: { name: string; operator: string; homepage: string; modes: Mode[] }; lat: number; lon: number; crc: string } | null> {
  try {
    const zip = await RemoteZip.open(url, signal);
    const routesTxt = await zip.text("routes.txt");
    if (!routesTxt) return null;

    const routes = parseRoutes(routesTxt);
    if (routes.length === 0) return null;

    const modes = [...new Set(routes.map((r) => r.mode))];

    let name = "";
    let operator = "";
    let homepage = "";
    try {
      const agencyTxt = await zip.text("agency.txt");
      if (agencyTxt) {
        const lines = agencyTxt.replace(/^﻿/, "").split(/\r?\n/).filter((l: string) => l.trim());
        if (lines.length > 1) {
          const col = header(lines[0]);
          const nameIdx = col("agency_name");
          const urlIdx = col("agency_url");
          const f = parseCsvLine(lines[1]);
          if (nameIdx >= 0) {
            name = f[nameIdx]?.trim() || "";
            operator = name;
          }
          if (urlIdx >= 0) homepage = f[urlIdx]?.trim() || "";
        }
      }
    } catch {}

    const pos = await medianStopPosition(zip);
    if (!pos) return null;

    const routesEntry = zip.find("routes.txt");
    const tripsEntry = zip.find("trips.txt");
    const stopsEntry = zip.find("stops.txt");
    if (!routesEntry || !tripsEntry || !stopsEntry) return null;
    const crc = `${routesEntry.crc}:${tripsEntry.crc}:${stopsEntry.crc}`;

    return { routes: { name, operator, homepage, modes }, ...pos, crc };
  } catch {
    return null;
  }
}

async function validateRealtime(url: string, type: "alerts" | "vehicles", signal: AbortSignal): Promise<{ valid: boolean; count: number; lat?: number; lon?: number }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal });
    if (!res.ok) return { valid: false, count: 0 };
    const buf = Buffer.from(await res.arrayBuffer());
    const feed = decodeFeed(buf);
    const now = Date.now() / 1000;

    if (type === "alerts") {
      const fresh = feed.entity.filter((e) => {
        if (!e.alert || !e.alert.headerText) return false;
        if (!e.alert.activePeriod?.length) return true;
        return e.alert.activePeriod.some((p: { end?: number | { toNumber(): number } | null }) => {
          if (!p.end) return true;
          const endVal = typeof p.end === "number" ? p.end : p.end.toNumber();
          return endVal > now - MAX_ALERT_HEADER_AGE_S;
        });
      });
      return { valid: fresh.length > 0, count: fresh.length };
    } else {
      const fresh = feed.entity.filter((e) => {
        if (!e.vehicle?.position) return false;
        if (!e.vehicle.timestamp) return true;
        const ts = typeof e.vehicle.timestamp === "number" ? e.vehicle.timestamp : e.vehicle.timestamp.toNumber();
        return ts > now - MAX_VEHICLE_AGE_S;
      });
      if (fresh.length === 0) return { valid: false, count: 0 };

      const lats = fresh.map((e) => e.vehicle!.position!.latitude).filter((lat) => lat != null && lat !== 0 && lat >= -90 && lat <= 90) as number[];
      const lons = fresh.map((e) => e.vehicle!.position!.longitude).filter((lon) => lon != null && lon !== 0 && lon >= -180 && lon <= 180) as number[];
      if (lats.length === 0) return { valid: true, count: fresh.length };

      lats.sort((a, b) => a - b);
      lons.sort((a, b) => a - b);
      const mid = Math.floor(lats.length / 2);
      return { valid: true, count: fresh.length, lat: lats[mid], lon: lons[mid] };
    }
  } catch {
    return { valid: false, count: 0 };
  }
}

async function computeFingerprint(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const zip = await RemoteZip.open(url, signal);
    const routesEntry = zip.find("routes.txt");
    const tripsEntry = zip.find("trips.txt");
    const stopsEntry = zip.find("stops.txt");
    if (!routesEntry || !tripsEntry || !stopsEntry) return null;
    return `${routesEntry.crc}:${tripsEntry.crc}:${stopsEntry.crc}`;
  } catch {
    return null;
  }
}

async function buildFingerprints(files: string[]): Promise<{ cache: Map<string, string>; existingFingerprints: Set<string> }> {
  const cacheFile = "/tmp/live-transit-fingerprints.json";
  let diskCache: Record<string, string> = {};

  if (existsSync(cacheFile)) {
    try {
      diskCache = JSON.parse(readFileSync(cacheFile, "utf8"));
    } catch {}
  }

  const cache = new Map<string, string>(Object.entries(diskCache));
  const existingFingerprints = new Set<string>();
  const urlsToCompute: string[] = [];

  for (const file of files) {
    if (!existsSync(file)) continue;
    const data = JSON.parse(readFileSync(file, "utf8"));
    const entries = Array.isArray(data) ? data : Object.values(data);

    for (const entry of entries) {
      const urls = [
        ...(entry.static || []),
        ...(entry.urls || [])
      ];

      for (const url of urls) {
        if (cache.has(url)) {
          existingFingerprints.add(cache.get(url)!);
        } else if (!urlsToCompute.includes(url)) {
          urlsToCompute.push(url);
        }
      }
    }
  }

  if (urlsToCompute.length > 0) {
    console.log(`Computing fingerprints for ${urlsToCompute.length} existing feeds...`);
    const computed = await pool(urlsToCompute, 16, async (url) => {
      const fp = await computeFingerprint(url, AbortSignal.timeout(TIMEOUT_MS));
      return { url, fp };
    });

    for (const { url, fp } of computed) {
      if (fp) {
        cache.set(url, fp);
        existingFingerprints.add(fp);
      }
    }

    writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(cache)));
    console.log(`Cached ${cache.size} fingerprints`);
  }

  return { cache, existingFingerprints };
}

function isExcludedUrl(url: string, existingUrls: Set<string>): boolean {
  if (existingUrls.has(url)) return true;

  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    if (u.hostname.includes("github.com") && !u.pathname.includes("/releases/download/")) return true;
  } catch {
    return true;
  }

  return false;
}

function makeId(prefix: string, country: string, city: string | undefined, operator: string, existingIds: Set<string>): string {
  const citySlug = city ? slugify(city) : "";
  const opSlug = slugify(operator);
  const parts = [prefix, country, citySlug, opSlug].filter(Boolean);
  let id = parts.join("-");

  if (id.length > 90) {
    const maxOpLen = 90 - prefix.length - country.length - (citySlug ? citySlug.length + 3 : 2);
    const truncOp = opSlug.slice(0, Math.max(1, maxOpLen)).replace(/-+$/, "");
    id = [prefix, country, citySlug, truncOp].filter((p) => p && p.length > 0).join("-");
  }

  id = id.replace(/-+$/, "").replace(/--+/g, "-");

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Invalid id format: ${id}`);
  }

  let finalId = id;
  let suffix = 2;
  while (existingIds.has(finalId)) {
    finalId = `${id}-${suffix}`;
    suffix++;
  }

  return finalId;
}

async function fetchTransitousFeeds(): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const baseUrl = "https://raw.githubusercontent.com/public-transport/transitous/master/feeds";

  try {
    const listRes = await fetch("https://api.github.com/repos/public-transport/transitous/contents/feeds", {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000)
    });

    if (!listRes.ok) {
      console.log("Failed to list Transitous feeds directory");
      return candidates;
    }

    const files = await listRes.json() as { name: string; type: string }[];
    const jsonFiles = files.filter((f) => f.type === "file" && f.name.endsWith(".json")).map((f) => f.name);

    console.log(`Found ${jsonFiles.length} Transitous feed files`);

    for (const fileName of jsonFiles) {
      try {
        const res = await fetch(`${baseUrl}/${fileName}`, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) continue;

        const data = await res.json() as { sources?: { name: string; type: string; spec?: string; url?: string; "use-feed-proxy"?: boolean }[] };

        if (!data.sources) continue;

        for (const source of data.sources) {
          if (!source.url || !source.url.startsWith("http")) continue;

          if (source["use-feed-proxy"] || JSON.stringify(source).includes("apikey") || JSON.stringify(source).includes("api_key")) continue;

          const spec = source.spec?.toLowerCase();
          const type = source.type?.toLowerCase();

          if (spec === "gtfs-rt") {
            candidates.push({
              name: source.name,
              operator: source.name,
              homepage: "",
              staticUrls: [],
              alertsUrls: [],
              vehiclesUrls: [source.url],
              origin: `transitous:${fileName}/${source.name}`
            });
          } else if (type === "http" && (source.url.endsWith(".zip") || source.url.includes("gtfs"))) {
            candidates.push({
              name: source.name,
              operator: source.name,
              homepage: "",
              staticUrls: [source.url],
              alertsUrls: [],
              vehiclesUrls: [],
              origin: `transitous:${fileName}/${source.name}`
            });
          }
        }
      } catch (err) {
        console.log(`Failed to fetch Transitous ${fileName}: ${err}`);
      }
    }
  } catch (err) {
    console.log(`Failed to fetch Transitous directory listing: ${err}`);
  }

  return candidates;
}

async function fetchMobilityDatabaseFeeds(): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  try {
    console.log("Fetching Mobility Database catalog...");
    const res = await fetch("https://files.mobilitydatabase.org/feeds_v2.csv", {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
      console.log("Failed to fetch Mobility Database catalog");
      return candidates;
    }

    const csv = await res.text();
    const rows = parseCsv(csv);

    for (const row of rows) {
      const status = row.status?.trim().toLowerCase();
      if (status !== "inactive" && status !== "deprecated") continue;

      const url = row.url?.trim();
      if (!url || !url.startsWith("http")) continue;

      const type = row.data_type?.trim().toLowerCase();
      if (type !== "gtfs") continue;

      const name = row.data_producer_name?.trim() || `MDB ${row.mdb_source_id}`;

      candidates.push({
        name,
        operator: name,
        homepage: "",
        staticUrls: [url],
        alertsUrls: [],
        vehiclesUrls: [],
        origin: `mobility-db:${row.mdb_source_id}`
      });
    }

    console.log(`Found ${candidates.length} inactive/deprecated feeds from Mobility Database`);
  } catch (err) {
    console.log(`Failed to fetch Mobility Database: ${err}`);
  }

  return candidates;
}

async function main() {
  if (RETRY_MODE) {
    console.log("=== RETRY MODE: Re-validating timed-out candidates with 300s timeout ===\n");
  }

  console.log("Building existing URL and fingerprint sets...");
  const files = [
    new URL("../src/connectors/schedule/feeds.json", import.meta.url).pathname,
    new URL("../src/connectors/schedule/extra-feeds.json", import.meta.url).pathname,
    new URL("../src/connectors/global-gtfs/feeds.json", import.meta.url).pathname,
    new URL("../src/connectors/global-gtfs/extra-feeds.json", import.meta.url).pathname,
    new URL("../src/connectors/static-gtfs.json", import.meta.url).pathname,
  ];

  if (RETRY_MODE) {
    files.push(SCHED_OUT, RT_OUT);
  }

  const existingUrls = new Set<string>();
  const existingIds = new Set<string>();

  for (const file of files) {
    if (!existsSync(file)) continue;
    const data = JSON.parse(readFileSync(file, "utf8"));
    const entries = Array.isArray(data) ? data : Object.values(data);

    for (const entry of entries) {
      if (entry.id) existingIds.add(entry.id);
      const urls = [
        ...(entry.static || []),
        ...(entry.alerts || []),
        ...(entry.vehicles || []),
        ...(entry.urls || [])
      ];
      urls.forEach((u) => existingUrls.add(u));
    }
  }

  console.log(`Found ${existingUrls.size} existing URLs and ${existingIds.size} existing IDs`);

  const { existingFingerprints } = await buildFingerprints(files);
  console.log(`Found ${existingFingerprints.size} existing fingerprints`);

  let candidates: Candidate[];
  const timedOutOrigins = new Set<string>();

  if (RETRY_MODE) {
    if (!existsSync(TIMEOUT_LOG)) {
      console.log("No timeout log found, nothing to retry");
      return;
    }
    const timeoutData = JSON.parse(readFileSync(TIMEOUT_LOG, "utf8")) as Candidate[];
    candidates = timeoutData;
    console.log(`Loaded ${candidates.length} timed-out candidates from previous run`);
  } else {
    console.log("\nFetching Transitous feeds...");
    const transitousCands = await fetchTransitousFeeds();
    console.log(`Found ${transitousCands.length} candidates from Transitous`);

    console.log("\nFetching Mobility Database inactive/deprecated feeds...");
    const mobilityCands = await fetchMobilityDatabaseFeeds();

    candidates = [...transitousCands, ...mobilityCands];
    console.log(`Total candidates: ${candidates.length}`);
  }

  const schedEntries: SchedEntry[] = [];
  const rtEntries: RTEntry[] = [];
  const validationFailures: Record<string, number> = {};

  console.log("\nFiltering duplicate URLs...");
  let duplicateUrlCount = 0;
  const candidatesToValidate = candidates.filter((cand) => {
    const allUrls = [...cand.staticUrls, ...cand.alertsUrls, ...cand.vehiclesUrls];
    if (allUrls.some((u) => isExcludedUrl(u, existingUrls))) {
      duplicateUrlCount++;
      return false;
    }
    return true;
  });

  console.log(`After URL deduplication: ${candidatesToValidate.length} candidates (filtered ${duplicateUrlCount} duplicates)`);

  console.log("\nValidating candidates...");

  const inFlight = new Map<number, string>();
  const progressTimer = setInterval(() => {
    if (inFlight.size > 0) {
      console.log(`Still processing ${inFlight.size} candidates: ${[...inFlight.values()].slice(0, 5).join(", ")}${inFlight.size > 5 ? "..." : ""}`);
    }
  }, 30_000);

  const results = await pool(candidatesToValidate, CONCURRENCY, async (cand, idx) => {
    const controller = new AbortController();
    const candId = `${cand.origin}`;
    inFlight.set(idx, candId);

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        controller.abort();
        validationFailures["timeout"] = (validationFailures["timeout"] || 0) + 1;
        timedOutOrigins.add(cand.origin);
        resolve(null);
      }, CANDIDATE_TIMEOUT_MS);
    });

    const validationPromise = (async (): Promise<ValidationResult> => {
      let staticValidation: Awaited<ReturnType<typeof validateStatic>> = null;
      let lat = 0;
      let lon = 0;
      let modes: Mode[] = [];
      let name = cand.name;
      let operator = cand.operator;
      let homepage = cand.homepage;

      if (cand.staticUrls.length > 0) {
        staticValidation = await validateStatic(cand.staticUrls[0], controller.signal);
        if (!staticValidation) {
          validationFailures["invalid_static"] = (validationFailures["invalid_static"] || 0) + 1;
          return null;
        }

        if (existingFingerprints.has(staticValidation.crc)) {
          validationFailures["duplicate_fingerprint"] = (validationFailures["duplicate_fingerprint"] || 0) + 1;
          return null;
        }

        lat = staticValidation.lat;
        lon = staticValidation.lon;
        modes = staticValidation.routes.modes;
        if (staticValidation.routes.name) {
          name = staticValidation.routes.name;
          operator = staticValidation.routes.operator;
        }
        if (staticValidation.routes.homepage) homepage = staticValidation.routes.homepage;
      }

      const alertsValid: string[] = [];
      const vehiclesValid: string[] = [];
      let vehicleCount = 0;

      for (const url of cand.alertsUrls) {
        const result = await validateRealtime(url, "alerts", controller.signal);
        if (result.valid) alertsValid.push(url);
        else validationFailures["invalid_alerts"] = (validationFailures["invalid_alerts"] || 0) + 1;
      }

      for (const url of cand.vehiclesUrls) {
        const result = await validateRealtime(url, "vehicles", controller.signal);
        if (result.valid) {
          vehiclesValid.push(url);
          vehicleCount += result.count;
          if (result.lat && result.lon && lat === 0) {
            lat = result.lat;
            lon = result.lon;
          }
        } else {
          validationFailures["invalid_vehicles"] = (validationFailures["invalid_vehicles"] || 0) + 1;
        }
      }

      if (staticValidation === null && alertsValid.length === 0 && vehiclesValid.length === 0) {
        validationFailures["no_valid_urls"] = (validationFailures["no_valid_urls"] || 0) + 1;
        return null;
      }

      if (lat === 0 || lon === 0) {
        validationFailures["no_position"] = (validationFailures["no_position"] || 0) + 1;
        return null;
      }

      const country = geo.countryAt(lon, lat);
      if (!country) {
        validationFailures["no_country"] = (validationFailures["no_country"] || 0) + 1;
        return null;
      }

      const region = REGION[country.toUpperCase()];
      if (!region) {
        validationFailures["no_region"] = (validationFailures["no_region"] || 0) + 1;
        return null;
      }

      const city = geo.nearestPlace(lon, lat);

      if (!name || !operator) {
        name = operator = cand.name || `Feed ${country}`;
      }

      if (!homepage) {
        homepage = cand.staticUrls[0] || cand.alertsUrls[0] || cand.vehiclesUrls[0] || "";
        try {
          const u = new URL(homepage);
          homepage = `${u.protocol}//${u.hostname}`;
        } catch {
          homepage = "";
        }
      }

      if (!homepage) {
        validationFailures["no_homepage"] = (validationFailures["no_homepage"] || 0) + 1;
        return null;
      }

      const hasRealtime = alertsValid.length > 0 || vehiclesValid.length > 0;

      if (hasRealtime) {
        const id = makeId("gtfs", country, city, operator, existingIds);
        existingIds.add(id);
        return {
          type: "rt" as const,
          entry: {
            id,
            name,
            operator,
            country,
            ...(city ? { city } : {}),
            region,
            modes: modes.length > 0 ? modes : ["bus"],
            homepage,
            lat,
            lon,
            ...(cand.license ? { license: cand.license } : {}),
            alerts: alertsValid,
            vehicles: vehiclesValid,
            vehicleCount,
            ...(cand.staticUrls.length > 0 ? { static: cand.staticUrls } : {})
          }
        };
      } else {
        const id = makeId("sched", country, city, operator, existingIds);
        existingIds.add(id);
        return {
          type: "sched" as const,
          entry: {
            id,
            name,
            operator,
            country,
            ...(city ? { city } : {}),
            region,
            modes,
            homepage,
            lat,
            lon,
            ...(cand.license ? { license: cand.license } : {}),
            static: cand.staticUrls,
            origin: cand.origin
          }
        };
      }
    })();

    const result = await Promise.race([validationPromise, timeoutPromise]);
    inFlight.delete(idx);
    return result;
  });

  clearInterval(progressTimer);

  console.log(`\nPool completed, processing ${results.length} results...`);
  let nullCount = 0;
  for (const result of results) {
    if (!result) {
      nullCount++;
      continue;
    }
    if (result.type === "sched") schedEntries.push(result.entry as SchedEntry);
    else rtEntries.push(result.entry as RTEntry);
  }

  console.log(`\nValidated ${schedEntries.length} schedule feeds and ${rtEntries.length} realtime feeds (${nullCount} filtered out)`);
  console.log("\nValidation failures:");
  for (const [reason, count] of Object.entries(validationFailures).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
  }

  const countryStats = new Map<string, { sched: number; rt: number }>();
  for (const e of schedEntries) {
    const c = countryStats.get(e.country) || { sched: 0, rt: 0 };
    c.sched++;
    countryStats.set(e.country, c);
  }
  for (const e of rtEntries) {
    const c = countryStats.get(e.country) || { sched: 0, rt: 0 };
    c.rt++;
    countryStats.set(e.country, c);
  }

  console.log("\nSources added per country:");
  for (const [country, stats] of [...countryStats].sort((a, b) => (b[1].sched + b[1].rt) - (a[1].sched + a[1].rt))) {
    console.log(`  ${country.toUpperCase()}: ${stats.sched} schedule, ${stats.rt} realtime`);
  }

  if (RETRY_MODE) {
    console.log("\nMerging with existing entries...");
    const existingSched = existsSync(SCHED_OUT) ? JSON.parse(readFileSync(SCHED_OUT, "utf8")) as SchedEntry[] : [];
    const existingRT = existsSync(RT_OUT) ? JSON.parse(readFileSync(RT_OUT, "utf8")) as RTEntry[] : [];

    const finalSched = [...existingSched, ...schedEntries];
    const finalRT = [...existingRT, ...rtEntries];

    console.log(`Schedule: ${existingSched.length} existing + ${schedEntries.length} new = ${finalSched.length} total`);
    console.log(`Realtime: ${existingRT.length} existing + ${rtEntries.length} new = ${finalRT.length} total`);

    console.log("\nWriting merged output files...");
    writeFileSync(`${SCHED_OUT}.tmp`, JSON.stringify(finalSched, null, 2) + "\n");
    renameSync(`${SCHED_OUT}.tmp`, SCHED_OUT);

    writeFileSync(`${RT_OUT}.tmp`, JSON.stringify(finalRT, null, 2) + "\n");
    renameSync(`${RT_OUT}.tmp`, RT_OUT);

    console.log(`Wrote ${finalSched.length} entries to ${SCHED_OUT.split("/src/")[1]}`);
    console.log(`Wrote ${finalRT.length} entries to ${RT_OUT.split("/src/")[1]}`);
  } else {
    console.log("\nNormal mode: writing to /tmp only (use RETRY_MODE=1 to merge into real files)");
    writeFileSync("/tmp/more-feeds-sched.json", JSON.stringify(schedEntries, null, 2) + "\n");
    writeFileSync("/tmp/more-feeds-rt.json", JSON.stringify(rtEntries, null, 2) + "\n");
    console.log(`Wrote ${schedEntries.length} schedule entries to /tmp/more-feeds-sched.json`);
    console.log(`Wrote ${rtEntries.length} realtime entries to /tmp/more-feeds-rt.json`);

    if (timedOutOrigins.size > 0) {
      console.log(`\nSaving ${timedOutOrigins.size} timed-out candidates for retry...`);
      const timedOutCandidates = candidatesToValidate.filter((c) => timedOutOrigins.has(c.origin));
      writeFileSync(TIMEOUT_LOG, JSON.stringify(timedOutCandidates, null, 2) + "\n");
      console.log(`Timeout log saved to ${TIMEOUT_LOG}`);
      console.log(`Run with RETRY_MODE=1 to re-validate with 300s timeout and merge results`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
