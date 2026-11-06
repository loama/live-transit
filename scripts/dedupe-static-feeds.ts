// Removes timetable-only sources whose static GTFS is byte-identical to another source's. Catalogs often list one
// aggregate feed several times under different names (for example a national feed under one of its member
// operators). Identity is the CRC-32 of routes.txt, trips.txt and stops.txt from each zip's central directory,
// read with a single range request. Different snapshots of one feed are caught too: routes.txt and stops.txt
// within 3% in size, stops.txt over 50 KB, and centers within 50 km. Hand-linked and realtime sources always win; among timetable-only
// duplicates the longest name is kept, since aggregates tend to carry the descriptive publisher name.
// Ids listed in the optional file (one per line, from keep-existing-feeds) are already published: they claim their
// feed first and are never removed, so only new entries are dropped as duplicates.
// Run after the generators: bun scripts/dedupe-static-feeds.ts [existing ids file]
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { RemoteZip } from "../src/lib/remote-zip";
import staticGtfs from "../src/connectors/static-gtfs.json";

const FILES = ["../src/connectors/schedule/feeds.json", "../src/connectors/schedule/extra-feeds.json", "../src/connectors/schedule/more-feeds.json", "../src/connectors/schedule/gap-feeds.json", "../src/connectors/schedule/nap-es.json", "../src/connectors/schedule/mvb-at.json"].map((f) => new URL(f, import.meta.url).pathname);
const PARTS = ["routes.txt", "trips.txt", "stops.txt"];

interface Entry { id: string; name: string; static: string[]; lat?: number; lon?: number }
interface Print { crc: string; routes: number; stops: number }

async function fingerprint(url: string): Promise<Print | null> {
  try {
    const zip = await RemoteZip.open(url, AbortSignal.timeout(30_000));
    const es = PARTS.map((p) => zip.find(p));
    if (es.some((e) => !e)) return null;
    return { crc: es.map((e) => e!.crc).join(":"), routes: es[0]!.size, stops: es[2]!.size };
  } catch {
    return null;
  }
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.03 * Math.max(a, b);
/** Another snapshot of the same feed: both files nearly the same size, a sizable stops file, and nearby. */
const sameFeed = (a: Print, b: Print, ea: { lat?: number; lon?: number }, eb: { lat?: number; lon?: number }) =>
  a.stops > 50_000 && close(a.routes, b.routes) && close(a.stops, b.stops)
  && ea.lat != null && eb.lat != null && Math.hypot((ea.lat - eb.lat!) * 111, (ea.lon! - eb.lon!) * 111 * Math.cos((ea.lat * Math.PI) / 180)) < 50;

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const existing = new Set(process.argv[2] ? readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean) : []);
const registries = FILES.map((f) => JSON.parse(readFileSync(f, "utf8")) as Entry[]);
const urls = [...new Set([...Object.values(staticGtfs).flatMap((v) => v.urls), ...registries.flat().flatMap((e) => e.static)])];
let n = 0;
const prints = new Map(urls.map((u, i) => [u, i]));
const fp = await pool(urls, 24, async (u) => {
  const r = await fingerprint(u);
  if (++n % 200 === 0) console.log(`fingerprinted ${n}/${urls.length}`);
  return r;
});
const printsOf = (us: string[]) => {
  const ps = us.map((u) => fp[prints.get(u)!]);
  return ps.every(Boolean) ? (ps as Print[]) : null;
};
const keyOf = (us: string[]) => printsOf(us)?.map((p) => p.crc).sort().join("|") ?? null;

const owner = new Map<string, string>();
for (const [id, v] of Object.entries(staticGtfs)) {
  const k = keyOf(v.urls);
  if (k) owner.set(k, id);
}
const candidates = registries.flat().filter((e) => keyOf(e.static)).sort((a, b) => Number(existing.has(b.id)) - Number(existing.has(a.id)) || b.name.length - a.name.length || a.id.localeCompare(b.id));
const drop = new Map<string, string>();
const keptSingles: { id: string; p: Print; e: Entry }[] = [];
for (const e of candidates) {
  const k = keyOf(e.static)!;
  const kept = owner.get(k);
  if (kept && !existing.has(e.id)) {
    drop.set(e.id, kept);
    continue;
  }
  const ps = printsOf(e.static)!;
  const twin = ps.length === 1 ? keptSingles.find((x) => sameFeed(x.p, ps[0], x.e, e)) : undefined;
  if (twin && !existing.has(e.id)) {
    drop.set(e.id, twin.id);
    continue;
  }
  owner.set(k, e.id);
  if (ps.length === 1) keptSingles.push({ id: e.id, p: ps[0], e });
}

FILES.forEach((file, i) => {
  const kept = registries[i].filter((e) => !drop.has(e.id));
  writeFileSync(`${file}.tmp`, `${JSON.stringify(kept, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  console.log(`${file.split("/src/")[1]}: ${registries[i].length} -> ${kept.length}`);
});
for (const [id, kept] of [...drop].slice(0, 25)) console.log(`duplicate ${id} of ${kept}`);
console.log(`${drop.size} duplicates removed`);
