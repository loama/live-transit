// Validates and imports discovery candidates into gap-feeds.json. Candidates are added by the discovery agent to
// discovery-candidates.json. This script validates each (zip opens, routes parse, location resolves), dedupes
// against existing registries, and appends validated entries to gap-feeds.json.
// Run: bun scripts/validate-candidates.ts
import { readFileSync, writeFileSync } from "node:fs";
import { RemoteZip } from "../src/lib/remote-zip";
import { parseRoutes, header, parseCsvLine } from "../src/lib/gtfs-static";
import { slugify, REGION, capId } from "./gen-global-gtfs";
import type { Mode, Region } from "../src/lib/types";
import staticGtfs from "../src/connectors/static-gtfs.json";

const CANDIDATES_FILE = new URL("./discovery-candidates.json", import.meta.url).pathname;
const GAP_FEEDS_FILE = new URL("../src/connectors/schedule/gap-feeds.json", import.meta.url).pathname;
const ALL_REGISTRIES = [
  "../src/connectors/schedule/feeds.json",
  "../src/connectors/schedule/extra-feeds.json",
  "../src/connectors/schedule/more-feeds.json",
  "../src/connectors/schedule/gap-feeds.json",
  "../src/connectors/schedule/nap-es.json",
  "../src/connectors/schedule/mvb-at.json",
].map((f) => new URL(f, import.meta.url).pathname);
const TIMEOUT_MS = 30_000;

interface Candidate {
  url: string;
  name: string;
  operator: string;
  country: string;
  city?: string;
  homepage?: string;
  license?: string;
  notes?: string;
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
  static: string[];
  origin: string;
}

type ValidationResult =
  | { ok: true; modes: Mode[]; lat?: number; lon?: number }
  | { ok: false; reason: string };

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
      if (lats.length >= 200) break;
    }
    if (lats.length < 5) return {};
    lats.sort((a, b) => a - b);
    lons.sort((a, b) => a - b);
    return { lat: lats[Math.floor(lats.length / 2)], lon: lons[Math.floor(lons.length / 2)] };
  } catch {
    return {};
  }
}

async function validateFeed(url: string): Promise<ValidationResult> {
  try {
    const zip = await RemoteZip.open(url, AbortSignal.timeout(TIMEOUT_MS));
    const routesCsv = await zip.text("routes.txt");
    if (!routesCsv) return { ok: false, reason: "no routes.txt" };
    const routes = parseRoutes(routesCsv);
    if (routes.length === 0) return { ok: false, reason: "empty routes" };
    const modes = [...new Set(routes.map((r) => r.mode))];
    const { lat, lon } = await extractMedianStop(zip);
    return { ok: true, modes, lat, lon };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const candidates: Candidate[] = JSON.parse(readFileSync(CANDIDATES_FILE, "utf8"));
  if (candidates.length === 0) {
    console.log("No candidates to validate");
    return;
  }

  const existingUrls = new Set<string>();
  for (const file of ALL_REGISTRIES) {
    try {
      const entries: Entry[] = JSON.parse(readFileSync(file, "utf8"));
      for (const e of entries) {
        for (const u of e.static) existingUrls.add(u);
      }
    } catch {}
  }
  for (const [, v] of Object.entries(staticGtfs)) {
    for (const u of v.urls) existingUrls.add(u);
  }

  const validated: Entry[] = [];
  const failed: Array<{ candidate: Candidate; reason: string }> = [];

  for (const c of candidates) {
    if (existingUrls.has(c.url)) {
      failed.push({ candidate: c, reason: "already exists in registries" });
      continue;
    }
    const result = await validateFeed(c.url);
    if (!result.ok) {
      failed.push({ candidate: c, reason: result.reason });
      continue;
    }
    const region = REGION[c.country.toUpperCase()];
    if (!region) {
      failed.push({ candidate: c, reason: `unknown country: ${c.country}` });
      continue;
    }
    const id = capId(slugify([c.country, c.city || "", c.operator, "discovery"].filter(Boolean).join(" ")));
    const entry: Entry = {
      id,
      name: c.name,
      operator: c.operator,
      country: c.country.toLowerCase(),
      city: c.city,
      region,
      modes: result.modes,
      homepage: c.homepage || "https://example.org",
      lat: result.lat,
      lon: result.lon,
      license: c.license,
      static: [c.url],
      origin: "discovery",
    };
    validated.push(entry);
    console.log(`✓ ${entry.id} (${result.modes.join(", ")}, ${entry.static.length} feed(s))`);
  }

  if (validated.length > 0) {
    const existing: Entry[] = JSON.parse(readFileSync(GAP_FEEDS_FILE, "utf8"));
    const merged = [...existing, ...validated];
    writeFileSync(GAP_FEEDS_FILE, `${JSON.stringify(merged, null, 2)}\n`);
    console.log(`Added ${validated.length} new entries to gap-feeds.json`);
  }

  if (failed.length > 0) {
    console.log(`\nFailed validation (${failed.length}):`);
    for (const { candidate, reason } of failed) {
      console.log(`  ${candidate.url}: ${reason}`);
    }
  }

  writeFileSync(CANDIDATES_FILE, "[]\n");
  console.log(`Cleared candidates file`);
}

main();
