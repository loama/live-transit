// Generates src/connectors/schedule/nap-es.json from Spain's National Access Point (nap.transportes.gob.es): one
// timetable source per current GTFS file. Needs SPAIN_NAP_API_KEY (free account); the key is only sent as a header
// (src/lib/feed-auth.ts) and never written to the registry. Metadata follows the other generators: names from the
// dataset and its publisher, homepage from agency.txt, position from the median stop, city from Natural Earth.
// Usage: bun scripts/gen-nap-es.ts <natural earth dir>   then bun scripts/dedupe-static-feeds.ts
import { renameSync, writeFileSync } from "node:fs";
import { connectors } from "../src/connectors";
import { authHeaders } from "../src/lib/feed-auth";
import { header, parseCsvLine, parseRoutes } from "../src/lib/gtfs-static";
import { RemoteZip } from "../src/lib/remote-zip";
import type { Mode } from "../src/lib/types";
import { capId, slugify } from "./gen-global-gtfs";
import { loadGeo } from "./lib/geo";

const API = "https://nap.transportes.gob.es/api/Fichero";
/** Required by the NAP data licence. */
const ATTRIBUTION = "Powered by MITRAMS (https://www.transportes.gob.es/), processed by Live Transit";
const OUT = new URL("../src/connectors/schedule/nap-es.json", import.meta.url).pathname;
const neDir = process.argv[2];
if (!neDir) throw new Error("usage: bun scripts/gen-nap-es.ts <natural earth dir>");
if (!process.env.SPAIN_NAP_API_KEY) throw new Error("SPAIN_NAP_API_KEY is not set");
const { countryAt, nearestPlace } = loadGeo(neDir);

interface Dataset {
  conjuntoDatoId: number; nombre: string; isObsolete: boolean;
  organizacion?: { nombre?: string }; operadores?: { nombre?: string }[];
  ficherosDto?: { ficheroId: number; tipoFicheroNombre?: string }[];
}

const list = (await (await fetch(`${API}/GetList`, { headers: { ...(await authHeaders(API)), Accept: "application/json" } })).json()) as { conjuntosDatoDto: Dataset[] };
const files = list.conjuntosDatoDto.filter((d) => !d.isObsolete).flatMap((d) =>
  (d.ficherosDto ?? []).filter((f) => f.tipoFicheroNombre === "GTFS-ZIP").map((f) => ({ d, url: `${API}/download/${f.ficheroId}`, id: f.ficheroId })));
console.log(`${files.length} current GTFS files`);

const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function describe(f: (typeof files)[number]) {
  const zip = await RemoteZip.open(f.url, AbortSignal.timeout(240_000));
  const csv = await zip.text("routes.txt");
  const routes = csv ? parseRoutes(csv) : [];
  if (!routes.length) throw new Error("no routes");
  const modes = [...new Set(routes.map((r) => r.mode))].filter((m) => m !== "other");
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
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    lats.push(lat);
    lons.push(lon);
  }
  if (!lats.length) throw new Error("no stops");
  const lat = median(lats);
  const lon = median(lons);
  return { modes: (modes.length ? modes : ["bus"]) as Mode[], homepage, lat, lon };
}

const taken = new Set(connectors.filter((c) => !c.meta.id.startsWith("sched-es-nap-")).map((c) => c.meta.id));
const out: Record<string, unknown>[] = [];
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < files.length) {
    const f = files[i++];
    try {
      const m = await describe(f);
      const country = countryAt(m.lon, m.lat) ?? "es";
      const city = nearestPlace(m.lon, m.lat);
      const operator = f.d.organizacion?.nombre?.trim() || f.d.operadores?.[0]?.nombre?.trim() || f.d.nombre;
      let id = capId(["sched-es-nap", slugify(f.d.nombre)].join("-"));
      for (let n = 2; taken.has(id); n++) id = capId(`sched-es-nap-${slugify(f.d.nombre)}-${n}`);
      taken.add(id);
      out.push({
        id, name: f.d.nombre.trim(), operator, country, ...(city ? { city } : {}), region: "europe", modes: m.modes,
        homepage: m.homepage ?? `https://nap.transportes.gob.es/Files/Detail/${f.d.conjuntoDatoId}`,
        lat: Math.round(m.lat * 1e4) / 1e4, lon: Math.round(m.lon * 1e4) / 1e4,
        license: "https://nap.transportes.gob.es/licencia-datos", attribution: ATTRIBUTION,
        static: [f.url], origin: `nap-es:${f.d.conjuntoDatoId}/${f.id}`,
      });
      console.log(`ok   ${id}`);
    } catch (e) {
      console.log(`fail ${f.d.nombre}: ${(e as Error).message.slice(0, 100)}`);
    }
  }
}));
out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
writeFileSync(`${OUT}.tmp`, `${JSON.stringify(out, null, 2)}\n`);
renameSync(`${OUT}.tmp`, OUT);
console.log(`${out.length} of ${files.length} written`);
