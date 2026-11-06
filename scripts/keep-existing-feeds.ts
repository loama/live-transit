// Makes a catalog regeneration additive. Ids are persisted and each one is a public page, so a network that
// existed at <ref> is never dropped or renamed by a refresh: entries missing after regeneration are restored as
// they were, and new entries that reuse a feed URL of an existing one (the same feed under a new id) are dropped.
// An existing network whose static, vehicle or alert list comes back empty keeps its previous URLs: a registry
// delisting a feed is not proof it is gone, and dead feeds already back off in ingest.
// Removing a network stays a deliberate edit. Writes the existing ids to <ids out> for dedupe-static-feeds.
// Usage: bun scripts/keep-existing-feeds.ts <ref> <ids out>
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const [ref, idsOut] = process.argv.slice(2);
if (!ref || !idsOut) throw new Error("usage: bun scripts/keep-existing-feeds.ts <ref> <ids out>");

const REGISTRIES = [
  "src/connectors/global-gtfs/feeds.json",
  "src/connectors/schedule/feeds.json",
  "src/connectors/schedule/extra-feeds.json",
  "src/connectors/schedule/more-feeds.json",
  "src/connectors/schedule/gap-feeds.json",
  "src/connectors/schedule/nap-es.json",
  "src/connectors/schedule/mvb-at.json",
];

const FEED_KEYS = ["static", "alerts", "vehicles"] as const;
type Entry = { id: string } & Partial<Record<(typeof FEED_KEYS)[number], string[]>>;
const feedUrls = (e: Entry) => [...(e.static ?? []), ...(e.alerts ?? []), ...(e.vehicles ?? [])];

function load(read: () => string): Entry[] {
  try {
    return JSON.parse(read()) as Entry[];
  } catch {
    return [];
  }
}

const before = REGISTRIES.map((f) => load(() => execFileSync("git", ["show", `${ref}:${f}`], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] })));
const after = REGISTRIES.map((f) => load(() => readFileSync(f, "utf8")));

const oldById = new Map(before.flat().map((e) => [e.id, e]));
const oldIds = new Set(oldById.keys());
const oldUrls = new Set(before.flat().flatMap(feedUrls));
const nowIds = new Set(after.flat().map((e) => e.id));

let restored = 0;
let feedsKept = 0;
let dropped = 0;
REGISTRIES.forEach((file, i) => {
  const kept = after[i].filter((e) => {
    const duplicate = !oldIds.has(e.id) && feedUrls(e).some((u) => oldUrls.has(u));
    if (duplicate) dropped++;
    return !duplicate;
  });
  for (const e of kept) {
    const old = oldById.get(e.id);
    for (const k of FEED_KEYS) {
      if (old?.[k]?.length && !e[k]?.length) {
        e[k] = old[k];
        feedsKept++;
      }
    }
  }
  const missing = before[i].filter((e) => !nowIds.has(e.id));
  restored += missing.length;
  const merged = [...kept, ...missing].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(`${file}.tmp`, `${JSON.stringify(merged, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
});

writeFileSync(idsOut, `${[...oldIds].join("\n")}\n`);
console.log(`restored ${restored} existing networks and ${feedsKept} feed lists, dropped ${dropped} new entries that reuse an existing feed URL`);
