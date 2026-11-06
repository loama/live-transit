// Generates src/connectors/schedule/mvb-at.json from Mobilitätsverbünde Österreich (data.mobilitaetsverbuende.at):
// the regional transport associations, the national railway reference feed and Linz AG. On-demand "Flex" zones,
// the timetable-changeover copy and the partial Styria set are left out since the main feeds cover them.
// Needs AUSTRIA_MVB_EMAIL and AUSTRIA_MVB_PASSWORD (free account, licence accepted); downloads authenticate through
// src/lib/feed-auth.ts. Download URLs carry a {year} placeholder resolved at import time to the newest active
// timetable year, so the registry does not need regenerating when the timetable year changes.
// Usage: bun scripts/gen-mvb-at.ts <natural earth dir> [dataset id ...]   then bun scripts/dedupe-static-feeds.ts
// With dataset ids, only those are fetched and merged into the existing registry.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { header, parseCsvLine, parseRoutes } from "../src/lib/gtfs-static";
import { RemoteZip } from "../src/lib/remote-zip";
import type { Mode } from "../src/lib/types";
import { capId, slugify } from "./gen-global-gtfs";
import { loadGeo } from "./lib/geo";

const API = "https://data.mobilitaetsverbuende.at/api/public/v1/data-sets";
const OUT = new URL("../src/connectors/schedule/mvb-at.json", import.meta.url).pathname;
const INCLUDE = [52, 53, 54, 55, 56, 57, 58, 66, 69];
/** Each feed bundles many operators, so the association's own site is the homepage rather than agency.txt's first. */
const HOMEPAGE: Record<number, string> = {
  52: "https://www.vor.at", 53: "https://www.verbundlinie.at", 54: "https://salzburg-verkehr.at", 55: "https://www.kaerntner-linien.at",
  56: "https://www.ooevv.at", 57: "https://www.vvt.at", 58: "https://www.vmobil.at", 66: "https://data.mobilitaetsverbuende.at", 69: "https://www.linzag.at",
};
/** Country-wide feeds have no single city. */
const NATIONAL = [66];
/** Required by the data licence. */
const ATTRIBUTION = "Data source: Mobilitätsverbünde Österreich OG - data.mobilitaetsverbuende.at";

const [neDir, ...only] = process.argv.slice(2);
if (!neDir) throw new Error("usage: bun scripts/gen-mvb-at.ts <natural earth dir>");
if (!process.env.AUSTRIA_MVB_EMAIL) throw new Error("AUSTRIA_MVB_EMAIL and AUSTRIA_MVB_PASSWORD are not set");
const { nearestPlace } = loadGeo(neDir);

interface DataSet { id: number; nameDe: string; nameEn: string; activeVersions: { year: number | string }[] }
const catalog = (await (await fetch(`${API}?tagFilterModeInclusive=true`)).json()) as DataSet[];
const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ids = only.length ? only.map(Number) : INCLUDE;
const out: Record<string, unknown>[] = only.length
  ? (JSON.parse(readFileSync(OUT, "utf8")) as Record<string, unknown>[]).filter((e) => !ids.some((id) => String(e.origin).replace(/\/.*$/, "") === `mvb-at:${id}`))
  : [];

for (const d of catalog.filter((x) => ids.includes(Number(x.id)))) {
  const year = Math.max(...d.activeVersions.map((v) => Number(v.year)));
  const url = `${API}/${d.id}/${year}/file`;
  // The registry keeps a placeholder so imports follow the timetable year change (see resolveFeedUrl).
  const registryUrl = `${API}/${d.id}/{year}/file`;
  let zip: RemoteZip | undefined;
  try {
    zip = await RemoteZip.open(url, AbortSignal.timeout(1_200_000));
    const routes = parseRoutes((await zip.text("routes.txt")) ?? "");
    const modes = [...new Set(routes.map((r) => r.mode))].filter((m) => m !== "other") as Mode[];
    let homepage: string | undefined;
    const agency = await zip.text("agency.txt");
    if (agency) {
      const lines = agency.split(/\r?\n/).filter(Boolean);
      const u = parseCsvLine(lines[1] ?? "")[header(lines[0])("agency_url")]?.trim();
      if (u && /^https?:\/\//i.test(u)) homepage = u;
    }
    const lats: number[] = [];
    const lons: number[] = [];
    let col: ((n: string) => number) | undefined;
    for await (const line of zip.lines("stops.txt")) {
      if (!col) { col = header(line); continue; }
      const p = parseCsvLine(line);
      const lat = Number(p[col("stop_lat")]);
      const lon = Number(p[col("stop_lon")]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
        lats.push(lat);
        lons.push(lon);
      }
    }
    const lat = median(lats);
    const lon = median(lons);
    const clean = d.nameDe.replace(/^Fahrplandaten\s+/i, "").replace(/\s*\(GTFS\)/gi, "").replace(/\s*-\s*(aktuell|Referenzdaten).*$/i, "").trim();
    const name = /^Eisenbahn$/i.test(clean) ? "Eisenbahn Österreich" : clean;
    const city = NATIONAL.includes(Number(d.id)) ? undefined : nearestPlace(lon, lat);
    out.push({
      id: capId(`sched-at-mvb-${slugify(name)}`), name, operator: name, country: "at", ...(city ? { city } : {}), region: "europe",
      modes: modes.length ? modes : ["bus"], homepage: HOMEPAGE[Number(d.id)] ?? homepage ?? "https://data.mobilitaetsverbuende.at",
      lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4,
      license: "https://data.mobilitaetsverbuende.at/api/public/v1/licenses/1/versions/2/files/en", attribution: ATTRIBUTION,
      static: [registryUrl], origin: `mvb-at:${d.id}`,
    });
    console.log(`ok   ${d.id} ${name}: ${routes.length} routes, ${lats.length} stops`);
  } catch (e) {
    console.log(`fail ${d.id} ${d.nameDe}: ${(e as Error).message.slice(0, 120)}`);
  } finally {
    await zip?.close();
  }
}
out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
writeFileSync(`${OUT}.tmp`, `${JSON.stringify(out, null, 2)}\n`);
renameSync(`${OUT}.tmp`, OUT);
console.log(`${out.length} written`);
