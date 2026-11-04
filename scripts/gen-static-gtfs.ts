// Generates src/connectors/static-gtfs.json: the static GTFS feed(s) behind each source, used to import
// its full line catalog and route geometry. Links come from the Mobility Database: each realtime feed we
// poll names its static schedule in `static_reference`. Sources not polled through a catalogued realtime
// feed are mapped by hand in OVERRIDES.
// Run: bun scripts/gen-static-gtfs.ts
import { writeFileSync } from "node:fs";
import { connectors } from "../src/connectors";
import type { Mode } from "../src/lib/types";
import { parseCsv } from "./gen-global-gtfs";

const CATALOG = "https://files.mobilitydatabase.org/feeds_v2.csv";
const OUT = new URL("../src/connectors/static-gtfs.json", import.meta.url).pathname;

/** Mobility Database ids or direct zip URLs, optionally keeping only some modes. */
const OVERRIDES: Record<string, { feeds: string[]; modes?: Mode[] }> = {
  "us-nyc-mta-subway": { feeds: ["https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip"] },
  "us-nyc-ferry": { feeds: ["mdb-515"] },
  "us-chicago-cta": { feeds: ["mdb-389"], modes: ["metro"] },
  "us-sf-bart": { feeds: ["mdb-53"] },
  "us-wa-wsf": { feeds: ["mdb-283"] },
  "us-amtrak": { feeds: ["mdb-11"] },
  "us-nj-njtransit": { feeds: ["mdb-509"] },
  "ca-montreal-stm-metro": { feeds: ["mdb-2126"], modes: ["metro"] },
  "ca-edmonton-ets": { feeds: ["mdb-714"] },
  "ca-calgary-transit": { feeds: ["mdb-712"] },
  "ca-halifax-transit": { feeds: ["mdb-734"] },
  "cl-santiago-metro": { feeds: ["mdb-3357"], modes: ["metro"] },
  "br-rio-smtr-sppo": { feeds: ["mdb-1791"], modes: ["bus"] },
  "br-belo-horizonte-bhtrans-bus": { feeds: ["mdb-9"] },
  "at-vienna-wiener-linien": { feeds: ["mdb-648"] },
  "de-munich-mvg": { feeds: ["mdb-2333"] },
  "ee-tallinn-transport": { feeds: ["mdb-3047"] },
  "lt-vilnius-transport": { feeds: ["mdb-1044"] },
  "no-entur": { feeds: ["mdb-1078"] },
  "nl-ovapi": { feeds: ["mdb-1077"] },
  "se-stockholm-sl": { feeds: ["mdb-3237"] },
  "ie-irish-rail": { feeds: ["mdb-2637"] },
  "be-sncb-irail": { feeds: ["mdb-686"] },
  "fr-sncf-alerts": { feeds: ["tdg-83582"] },
  "my-klang-valley-rapid-bus": { feeds: ["tld-6767"] },
  "my-national-ktmb": { feeds: ["tld-6758"] },
  "us-philadelphia-septa": { feeds: ["mdb-503", "mdb-502"] },
  "ca-toronto-ttc": { feeds: ["mdb-2253"] },
  "us-nyc-nj-path": { feeds: ["mdb-517"] },
  "us-atlanta-marta": { feeds: ["mdb-368"] },
  "co-bogota-transmilenio": { feeds: ["mdb-3358"] },
  "ie-dublin-luas": { feeds: ["mdb-2638"] },
  "gtfs-us-lexington-lextran": { feeds: ["mdb-2067"] },
  "gtfs-us-modesto-stanrta": { feeds: ["mdb-2273"] },
  "gtfs-us-sacramento-sacrt": { feeds: ["mdb-2137"] },
  "gtfs-us-st-louis-metro": { feeds: ["mdb-190"] },
};

type Row = Record<string, string>;

const zipUrl = (r: Row | undefined) => r?.["urls.latest"] || r?.["urls.direct_download"] || undefined;

async function main() {
  const rows: Row[] = parseCsv(await (await fetch(CATALOG)).text());
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rtByUrl = new Map(rows.filter((r) => r.data_type === "gtfs_rt").map((r) => [r["urls.direct_download"], r]));
  const out: Record<string, { urls: string[]; modes?: Mode[] }> = {};
  const missing: string[] = [];

  for (const c of connectors) {
    const o = OVERRIDES[c.meta.id];
    let urls: string[];
    if (o) {
      urls = o.feeds.map((f) => (/^https?:/.test(f) ? f : zipUrl(byId.get(f)))).filter((u): u is string => !!u);
    } else {
      const refs = new Set<string>();
      for (const e of c.meta.endpoints) for (const id of rtByUrl.get(e)?.static_reference.split("|") ?? []) if (id) refs.add(id);
      const statics = [...refs].map((id) => byId.get(id)).filter((r): r is Row => !!r && r.status !== "inactive");
      urls = [...new Set(statics.map(zipUrl).filter((u): u is string => !!u))];
    }
    if (urls.length) out[c.meta.id] = { urls, ...(o?.modes ? { modes: o.modes } : {}) };
    else if (c.meta.kind !== "fids") missing.push(c.meta.id);
  }

  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`${Object.keys(out).length} of ${connectors.length} sources mapped to a static feed`);
  console.log(`unmapped (non-aviation): ${missing.join(", ")}`);
}

if (import.meta.main) await main();
