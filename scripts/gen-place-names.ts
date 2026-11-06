#!/usr/bin/env bun
/**
 * Generate a compact multilingual place alias index for city search.
 * Matches our sources' cities to Natural Earth places, extracts names in all available languages.
 */

const NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson";
const OUT_PATH = new URL("../src/data/place-aliases.json", import.meta.url).pathname;
const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5433/postgres";

const FROM = "áàâäãåéèêëíìîïóòôöõøúùûüýñçšžłß";
const TO = "aaaaaaeeeeiiiiooooouuuuyncszls";
const fold = (s: string) => [...s.toLowerCase()].map((c) => (FROM.includes(c) ? TO[FROM.indexOf(c)] : c)).join("");

interface NEPlace {
  name: string;
  lat: number;
  lon: number;
  iso2: string;
  names: Set<string>;
}

interface Source {
  id: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function similarity(a: string, b: string): number {
  const fa = fold(a);
  const fb = fold(b);
  if (fa === fb) return 1.0;
  const len = Math.max(fa.length, fb.length);
  let same = 0;
  for (let i = 0; i < Math.min(fa.length, fb.length); i++) {
    if (fa[i] === fb[i]) same++;
  }
  return same / len;
}

async function fetchNaturalEarth(): Promise<NEPlace[]> {
  console.log("Downloading Natural Earth populated places...");
  const resp = await fetch(NE_URL);
  if (!resp.ok) throw new Error(`Failed to fetch Natural Earth data: ${resp.status}`);
  const data = await resp.json();
  const places: NEPlace[] = [];

  for (const feature of data.features) {
    const p = feature.properties;
    const names = new Set<string>();
    names.add(p.NAME);
    if (p.NAMEASCII && p.NAMEASCII !== p.NAME) names.add(p.NAMEASCII);

    for (const key of Object.keys(p)) {
      if (key.startsWith("NAME_") && p[key] && typeof p[key] === "string") {
        names.add(p[key]);
      }
    }

    if (p.NAMEPAR) names.add(p.NAMEPAR);
    if (p.MEGANAME) names.add(p.MEGANAME);
    if (p.ADM1NAME && p.ADM1NAME !== p.NAME) names.add(p.ADM1NAME);

    places.push({
      name: p.NAME,
      lat: p.LATITUDE,
      lon: p.LONGITUDE,
      iso2: (p.ISO_A2 || "").toLowerCase(),
      names,
    });
  }

  console.log(`Loaded ${places.length} Natural Earth places`);
  return places;
}

async function fetchSources(): Promise<Source[]> {
  const psql = Bun.spawn(["psql", DATABASE_URL, "-t", "-c", "SELECT id, city, country, lat, lon FROM sources WHERE enabled AND city IS NOT NULL AND lat IS NOT NULL"], {
    stdout: "pipe",
  });
  const text = await new Response(psql.stdout).text();
  await psql.exited;

  const sources: Source[] = [];
  for (const line of text.trim().split("\n")) {
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length < 5) continue;
    const [id, city, country, lat, lon] = parts;
    if (!city || !lat || !lon) continue;
    sources.push({ id, city, country, lat: parseFloat(lat), lon: parseFloat(lon) });
  }

  console.log(`Loaded ${sources.length} sources with cities`);
  return sources;
}

function matchPlaces(sources: Source[], nePlaces: NEPlace[]): Map<string, Set<string>> {
  const placeAliases = new Map<string, Set<string>>();

  for (const src of sources) {
    let bestMatch: NEPlace | null = null;
    let bestScore = 0;

    for (const place of nePlaces) {
      const dist = distance(src.lat, src.lon, place.lat, place.lon);
      if (dist > 25) continue;

      const nameSim = similarity(src.city, place.name);
      const score = nameSim * 10 + Math.max(0, (25 - dist) / 25) * 5;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = place;
      }
    }

    if (bestMatch) {
      const key = `${fold(bestMatch.name)}:${bestMatch.iso2}`;
      if (!placeAliases.has(key)) {
        placeAliases.set(key, new Set());
      }
      const aliases = placeAliases.get(key)!;
      for (const name of bestMatch.names) {
        aliases.add(name);
      }
      aliases.add(src.city);
    }
  }

  console.log(`Matched ${placeAliases.size} unique places`);
  return placeAliases;
}

function isLatin(s: string): boolean {
  return /^[A-Za-z\s-]+$/.test(s);
}

function buildIndex(placeAliases: Map<string, Set<string>>): Record<string, string[]> {
  const index: Record<string, string[]> = {};

  for (const aliases of placeAliases.values()) {
    const uniqueFolded = new Map<string, string>();

    for (const name of aliases) {
      const folded = fold(name);
      if (!uniqueFolded.has(folded) || name.length < uniqueFolded.get(folded)!.length) {
        uniqueFolded.set(folded, name);
      }
    }

    if (uniqueFolded.size === 1) continue;

    const allNames = Array.from(uniqueFolded.values());

    for (const [folded, name] of uniqueFolded) {
      if (!index[folded]) {
        index[folded] = [];
      }

      for (const otherName of allNames) {
        if (otherName !== name && !index[folded].includes(otherName)) {
          index[folded].push(otherName);
        }
      }

      const latin = index[folded].filter(isLatin);
      const nonLatin = index[folded].filter(n => !isLatin(n));
      latin.sort((a, b) => a.length - b.length || a.localeCompare(b));
      nonLatin.sort((a, b) => a.length - b.length || a.localeCompare(b));

      index[folded] = [...latin.slice(0, 4), ...nonLatin.slice(0, 2)];
    }
  }

  return index;
}

async function main() {
  const [sources, nePlaces] = await Promise.all([fetchSources(), fetchNaturalEarth()]);
  const placeAliases = matchPlaces(sources, nePlaces);
  const index = buildIndex(placeAliases);

  const json = JSON.stringify(index);
  await Bun.write(OUT_PATH, json);

  const size = Buffer.byteLength(json, "utf8");
  const sizeKB = (size / 1024).toFixed(1);
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`Size: ${sizeKB} KB (${size} bytes)`);
  console.log(`Aliases: ${Object.keys(index).length} folded terms`);
  console.log(`Places covered: ${placeAliases.size}`);

  const sample = ["vienna", "wien", "viena", "munich", "munchen", "london", "londres"];
  console.log("\nSample lookups:");
  for (const term of sample) {
    const folded = fold(term);
    const result = index[folded];
    if (result) {
      console.log(`  ${term} -> ${result.slice(0, 5).join(", ")}${result.length > 5 ? "..." : ""}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
