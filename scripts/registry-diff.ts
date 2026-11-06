// Lists networks added to and removed from the feed registries relative to a git ref, as Markdown.
// Ids are persisted, so a removed id means a network disappears from the site.
// Usage: bun scripts/registry-diff.ts [ref]   (default origin/main)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ref = process.argv[2] ?? "origin/main";
const FILES = [
  "src/connectors/global-gtfs/feeds.json",
  "src/connectors/schedule/feeds.json",
  "src/connectors/schedule/extra-feeds.json",
  "src/connectors/schedule/more-feeds.json",
  "src/connectors/schedule/gap-feeds.json",
  "src/connectors/schedule/nap-es.json",
  "src/connectors/schedule/mvb-at.json",
];

type Entry = { id: string; name: string; country: string };

function entries(read: (file: string) => string | null): Map<string, Entry> {
  const out = new Map<string, Entry>();
  for (const file of FILES) {
    const text = read(file);
    if (text) for (const e of JSON.parse(text) as Entry[]) out.set(e.id, e);
  }
  return out;
}

const before = entries((f) => {
  try {
    return execFileSync("git", ["show", `${ref}:${f}`], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
});
const after = entries((f) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return null;
  }
});

const added = [...after.values()].filter((e) => !before.has(e.id));
const removed = [...before.values()].filter((e) => !after.has(e.id));
const line = (e: Entry) => `- \`${e.id}\` ${e.name} (${e.country.toUpperCase()})`;

console.log(`${added.length} networks added, ${removed.length} removed; ${after.size} in total.`);
if (added.length) console.log(`\n### Added\n\n${added.map(line).join("\n")}`);
if (removed.length) console.log(`\n### Removed\n\nThese ids exist in production; merging drops their pages.\n\n${removed.map(line).join("\n")}`);
