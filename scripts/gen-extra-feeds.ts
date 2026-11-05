import { writeFileSync } from "node:fs";
import { RemoteZip } from "../src/lib/remote-zip";
import { parseRoutes } from "../src/lib/gtfs-static";
import { decodeFeed } from "../src/lib/gtfs-rt";
import { USER_AGENT } from "../src/lib/http";
import { REGION, slugify, parseCsv } from "./gen-global-gtfs";
import type { Mode, Region } from "../src/lib/types";
import staticGtfs from "../src/connectors/static-gtfs.json";
import globalFeeds from "../src/connectors/global-gtfs/feeds.json";

const CONCURRENCY = 16;
const TIMEOUT_MS = 30_000;
const MAX_VEHICLE_AGE_S = 2 * 3600;
const MAX_ALERT_HEADER_AGE_S = 7 * 86400;

const OUT_SCHED = new URL("../src/connectors/schedule/extra-feeds.json", import.meta.url).pathname;
const OUT_RT = new URL("../src/connectors/global-gtfs/extra-feeds.json", import.meta.url).pathname;

interface SchedEntry {
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

interface RtEntry {
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
  static?: string[];
  alerts: string[];
  vehicles: string[];
  vehicleCount: number;
  origin: string;
}

interface Candidate {
  onestopId?: string;
  name: string;
  operator: string;
  country: string;
  city?: string;
  lat?: number;
  lon?: number;
  homepage?: string;
  license?: string;
  staticUrls: string[];
  alertsUrls: string[];
  vehiclesUrls: string[];
  origin: string;
}

const seenUrls = new Set<string>();
const seenIds = new Set<string>();

function initSeenUrls() {
  for (const feed of globalFeeds) {
    for (const url of [...feed.alerts, ...feed.vehicles]) seenUrls.add(url);
  }
  for (const [, entry] of Object.entries(staticGtfs)) {
    for (const url of (entry as { urls: string[] }).urls) seenUrls.add(url);
  }
  for (const feed of globalFeeds) seenIds.add(feed.id);
  for (const key of Object.keys(staticGtfs)) seenIds.add(key);
}

async function fetchMobilityDbCatalog(): Promise<Set<string>> {
  const csv = await (await fetch("https://files.mobilitydatabase.org/feeds_v2.csv")).text();
  const rows = parseCsv(csv);
  const urls = new Set<string>();
  for (const r of rows) {
    const direct = r["urls.direct_download"];
    const latest = r["urls.latest"];
    if (direct) urls.add(direct);
    if (latest) urls.add(latest);
  }
  return urls;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

async function validateStatic(url: string): Promise<{ valid: boolean; modes: Mode[]; lat?: number; lon?: number }> {
  try {
    const zip = await RemoteZip.open(url, AbortSignal.timeout(TIMEOUT_MS));
    const routesTxt = await zip.text("routes.txt");
    if (!routesTxt) return { valid: false, modes: [] };
    const routes = parseRoutes(routesTxt);
    if (routes.length === 0) return { valid: false, modes: [] };
    const modes: Mode[] = [...new Set(routes.map((r) => r.mode))].filter((m): m is Exclude<Mode, "other"> => m !== "other");
    if (modes.length === 0 && routes.some((r) => r.mode === "other")) modes.push("other" as Mode);
    const stopsTxt = await zip.text("stops.txt");
    if (stopsTxt) {
      const lines = stopsTxt.split("\n").slice(1, 1000);
      const lats: number[] = [];
      const lons: number[] = [];
      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length >= 5) {
          const lat = Number(parts[3]);
          const lon = Number(parts[4]);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            lats.push(lat);
            lons.push(lon);
          }
        }
      }
      if (lats.length > 0) {
        const lat = +(lats.reduce((a, b) => a + b) / lats.length).toFixed(4);
        const lon = +(lons.reduce((a, b) => a + b) / lons.length).toFixed(4);
        return { valid: true, modes, lat, lon };
      }
    }
    return { valid: true, modes };
  } catch {
    return { valid: false, modes: [] };
  }
}

async function validateRealtime(url: string, kind: "alerts" | "vehicles"): Promise<{ valid: boolean; vehicles: number }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { valid: false, vehicles: 0 };
    const feed = decodeFeed(new Uint8Array(await res.arrayBuffer()));
    const now = Date.now() / 1000;
    const header = Number(feed.header?.timestamp ?? 0);
    if (kind === "alerts") {
      if (header && now - header > MAX_ALERT_HEADER_AGE_S) return { valid: false, vehicles: 0 };
      return { valid: true, vehicles: 0 };
    }
    const withPos = feed.entity.filter((e) => e.vehicle?.position?.latitude && e.vehicle.position.longitude);
    if (!withPos.length) return { valid: false, vehicles: 0 };
    const stamps = [header, ...withPos.map((e) => Number(e.vehicle?.timestamp ?? 0))].filter((x) => x > 0);
    const latest = Math.max(0, ...stamps);
    if (!latest || now - latest > MAX_VEHICLE_AGE_S) return { valid: false, vehicles: 0 };
    return { valid: true, vehicles: withPos.length };
  } catch {
    return { valid: false, vehicles: 0 };
  }
}

function extractCountryFromOnestop(onestopId: string): string {
  const parts = onestopId.split("~");
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].replace(/~rt$/i, "");
    if (/^[a-z]{2}$/.test(part) && REGION[part.toUpperCase()]) return part;
  }
  const match = onestopId.match(/^f-([a-z]{2})[~-]/);
  if (match && REGION[match[1].toUpperCase()]) return match[1];
  return "";
}

async function fetchTransitlandFeeds(): Promise<Candidate[]> {
  const tree = await (await fetch("https://api.github.com/repos/transitland/transitland-atlas/git/trees/main?recursive=1")).json();
  const dmfrPaths: string[] = tree.tree.filter((e: { path: string }) => e.path.startsWith("feeds/") && e.path.endsWith(".dmfr.json")).map((e: { path: string }) => e.path);
  console.log(`Transitland: ${dmfrPaths.length} DMFR files`);
  const candidates: Candidate[] = [];
  const results = await pool(dmfrPaths, CONCURRENCY, async (path, i) => {
    if (i % 50 === 0) console.log(`  processing ${i}/${dmfrPaths.length}`);
    try {
      const url = `https://raw.githubusercontent.com/transitland/transitland-atlas/main/${path}`;
      const data = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).json();
      const feeds: Candidate[] = [];
      for (const f of data.feeds ?? []) {
        if (f.authorization) continue;
        const staticUrl = f.urls?.static_current;
        const vehiclesUrl = f.urls?.realtime_vehicle_positions;
        const alertsUrl = f.urls?.realtime_alerts;
        if (!staticUrl && !vehiclesUrl && !alertsUrl) continue;
        if (staticUrl && seenUrls.has(staticUrl)) continue;
        if (vehiclesUrl && seenUrls.has(vehiclesUrl)) continue;
        if (alertsUrl && seenUrls.has(alertsUrl)) continue;
        const country = extractCountryFromOnestop(f.id);
        const cityParts = f.id.split("~").slice(1);
        const city = cityParts.length > 0 ? cityParts.join(" ").replace(/~rt$/i, "").trim() : "";
        feeds.push({
          onestopId: f.id,
          name: f.name || f.operators?.[0]?.name || "",
          operator: f.operators?.[0]?.name || f.name || "",
          country,
          city,
          homepage: f.operators?.[0]?.website || f.urls?.static_download || "",
          license: f.license?.url,
          staticUrls: staticUrl ? [staticUrl] : [],
          alertsUrls: alertsUrl ? [alertsUrl] : [],
          vehiclesUrls: vehiclesUrl ? [vehiclesUrl] : [],
          origin: `transitland:${f.id}`,
        });
      }
      return feeds;
    } catch {
      return [];
    }
  });
  for (const list of results) candidates.push(...list);
  return candidates;
}

async function fetchFranceTransportData(): Promise<Candidate[]> {
  console.log("France transport.data.gouv.fr API");
  const datasets = await (await fetch("https://transport.data.gouv.fr/api/datasets")).json();
  const candidates: Candidate[] = [];
  for (const ds of datasets) {
    const resources = (ds.resources ?? []).concat(ds.community_resources ?? []);
    const gtfsRes = resources.filter((r: { format: string }) => r.format === "gtfs");
    const gtfsRtRes = resources.filter((r: { format: string }) => r.format === "gtfs-rt");
    if (gtfsRes.length === 0 && gtfsRtRes.length === 0) continue;
    const staticUrls = gtfsRes.map((r: { url: string }) => r.url).filter((u: string) => u && !seenUrls.has(u));
    const rtUrls = gtfsRtRes.map((r: { url: string }) => r.url).filter((u: string) => u && !seenUrls.has(u));
    if (staticUrls.length === 0 && rtUrls.length === 0) continue;
    const name = ds.title || ds.slug || "";
    candidates.push({
      name,
      operator: ds.publisher?.name || name,
      country: "fr",
      homepage: ds.page_url || "",
      license: ds.licence === "lov2" ? "https://www.data.gouv.fr/pages/legal/licences/etalab-2.0" : undefined,
      staticUrls,
      alertsUrls: [],
      vehiclesUrls: rtUrls,
      origin: `tdg-fr:${ds.id}`,
    });
  }
  return candidates;
}

function makeId(country: string, city: string, operator: string, prefix: string, existing: Set<string>): string {
  const parts = [prefix, country, city, operator].filter(Boolean).map(slugify);
  let id = parts.join("-");
  let n = 2;
  while (existing.has(id) || seenIds.has(id)) {
    id = `${parts.join("-")}-${n++}`;
  }
  return id;
}

async function main() {
  console.log("Initializing");
  initSeenUrls();
  console.log(`  Existing: ${globalFeeds.length} realtime, ${Object.keys(staticGtfs).length} static`);
  const mobilityDbUrls = await fetchMobilityDbCatalog();
  console.log(`  Mobility Database: ${mobilityDbUrls.size} URLs`);
  for (const url of mobilityDbUrls) seenUrls.add(url);

  console.log("\nFetching catalogs");
  const [transitland, france] = await Promise.all([fetchTransitlandFeeds(), fetchFranceTransportData()]);
  const allCandidates = [...transitland, ...france];
  console.log(`Total candidates: ${allCandidates.length}`);

  console.log("\nValidating feeds");
  const schedEntries: SchedEntry[] = [];
  const rtEntries: RtEntry[] = [];
  const stats = { static: { valid: 0, invalid: 0 }, alerts: { valid: 0, invalid: 0 }, vehicles: { valid: 0, invalid: 0 } };

  const validated = await pool(allCandidates, CONCURRENCY, async (cand, i) => {
    if (i % 20 === 0) console.log(`  ${i}/${allCandidates.length}`);
    const result: { cand: Candidate; static?: { valid: boolean; modes: Mode[]; lat?: number; lon?: number }; alerts?: boolean; vehicles?: { valid: boolean; count: number } } = { cand };
    if (cand.staticUrls.length > 0) {
      const val = await validateStatic(cand.staticUrls[0]);
      result.static = val;
      if (val.valid) {
        cand.lat = cand.lat ?? val.lat;
        cand.lon = cand.lon ?? val.lon;
      }
    }
    if (cand.alertsUrls.length > 0) {
      const val = await validateRealtime(cand.alertsUrls[0], "alerts");
      result.alerts = val.valid;
    }
    if (cand.vehiclesUrls.length > 0) {
      const val = await validateRealtime(cand.vehiclesUrls[0], "vehicles");
      result.vehicles = { valid: val.valid, count: val.vehicles };
    }
    return result;
  });

  const usedIds = new Set<string>();
  for (const v of validated) {
    const { cand, static: staticVal, alerts, vehicles } = v;
    const hasStatic = staticVal?.valid;
    const hasAlerts = alerts === true;
    const hasVehicles = vehicles?.valid === true;
    if (hasStatic) stats.static.valid++;
    else if (staticVal) stats.static.invalid++;
    if (hasAlerts) stats.alerts.valid++;
    else if (cand.alertsUrls.length > 0) stats.alerts.invalid++;
    if (hasVehicles) stats.vehicles.valid++;
    else if (cand.vehiclesUrls.length > 0) stats.vehicles.invalid++;

    if (!hasStatic && !hasAlerts && !hasVehicles) continue;
    let country = cand.country;
    if (!country && cand.onestopId) country = extractCountryFromOnestop(cand.onestopId);
    if (!/^[a-z]{2}$/.test(country)) continue;
    const region = REGION[country.toUpperCase()];
    if (!region) continue;
    const city = cand.city || cand.onestopId?.split("~")[1]?.replace(/~/g, " ") || "";
    const modes: Mode[] = staticVal?.valid ? staticVal.modes : ["bus"];
    const name = cand.name || cand.operator;
    const homepage = cand.homepage || cand.staticUrls[0] || cand.vehiclesUrls[0] || cand.alertsUrls[0] || "";

    if (hasStatic && !hasAlerts && !hasVehicles) {
      const id = makeId(country, city, cand.operator, "sched", usedIds);
      usedIds.add(id);
      schedEntries.push({
        id,
        name,
        operator: cand.operator,
        country,
        city: city || undefined,
        region,
        modes,
        homepage,
        lat: cand.lat,
        lon: cand.lon,
        license: cand.license,
        static: cand.staticUrls,
        origin: cand.origin,
      });
    } else if (hasAlerts || hasVehicles) {
      const id = makeId(country, city, cand.operator, "gtfs", usedIds);
      usedIds.add(id);
      rtEntries.push({
        id,
        name,
        operator: cand.operator,
        country,
        city: city || undefined,
        region,
        modes,
        homepage,
        lat: cand.lat,
        lon: cand.lon,
        license: cand.license,
        static: hasStatic ? cand.staticUrls : undefined,
        alerts: cand.alertsUrls,
        vehicles: cand.vehiclesUrls,
        vehicleCount: vehicles?.count ?? 0,
        origin: cand.origin,
      });
    }
  }

  schedEntries.sort((a, b) => a.id.localeCompare(b.id));
  rtEntries.sort((a, b) => a.id.localeCompare(b.id));

  writeFileSync(`${OUT_SCHED}.tmp`, `${JSON.stringify(schedEntries, null, 2)}\n`);
  writeFileSync(`${OUT_RT}.tmp`, `${JSON.stringify(rtEntries, null, 2)}\n`);
  const { renameSync } = await import("node:fs");
  renameSync(`${OUT_SCHED}.tmp`, OUT_SCHED);
  renameSync(`${OUT_RT}.tmp`, OUT_RT);

  console.log("\nResults:");
  console.log(`  Static-only: ${schedEntries.length} sources`);
  console.log(`  Realtime: ${rtEntries.length} sources`);
  console.log(`\nValidation stats:`);
  console.log(`  Static: ${stats.static.valid} valid, ${stats.static.invalid} invalid`);
  console.log(`  Alerts: ${stats.alerts.valid} valid, ${stats.alerts.invalid} invalid`);
  console.log(`  Vehicles: ${stats.vehicles.valid} valid, ${stats.vehicles.invalid} invalid`);

  const byCountry: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  for (const e of schedEntries.concat(rtEntries as unknown as SchedEntry[])) {
    byCountry[e.country] = (byCountry[e.country] ?? 0) + 1;
    byRegion[e.region] = (byRegion[e.region] ?? 0) + 1;
  }
  console.log(`\nBy country:`, byCountry);
  console.log(`By region:`, byRegion);
}

if (import.meta.main) await main();
