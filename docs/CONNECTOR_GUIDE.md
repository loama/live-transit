# Writing a connector

A connector polls one official public source and returns normalized data. Read these first:

- `src/lib/types.ts`: the normalized model (`SourceMeta`, `Alert`, `LineStatus`, `Vehicle`, `Departure`, `StationStatus`) and the `Connector` interface.
- `src/lib/http.ts`: `fetchJson`, `fetchText`, `fetchBuffer`. Always fetch through `ctx` so timeouts, retries and the User-Agent apply.
- `src/lib/gtfs-rt.ts`: `gtfsRtConnector(meta, { alerts, vehicles, defaultMode, routeNames, routeModes, languages })` builds a complete connector for any standard GTFS-Realtime feed in a few lines.
- `src/connectors/europe/tfl.ts` + `tfl.test.ts`: the reference hand-written connector and test.
- `scripts/harness.ts`: `runConnector(c)` runs live and validates output. `bun scripts/try.ts <id-or-prefix> --json` prints counts and samples.

## Rules

1. Official sources only: the operator, the airport, a government open-data portal, or the operator's own public website/app backend. No third-party aggregators (no FlightAware, no Moovit).
2. Keyless only. If a source needs a registration key, do not implement it; add it to your group's `planned.ts` (see below) instead.
3. Verify every endpoint live with curl before writing code, and again via `bun scripts/try.ts`. Never ship a connector you have not seen return real data today.
4. Map to the model faithfully. Prefer the richest kind each source offers:
   - Line-by-line network status -> `lines` (and an `alerts` entry for each disruption with text).
   - Service alerts / incidents -> `alerts`. Ids must be stable across runs (use the source id, or a hash of line + text).
   - Live positions -> `vehicles`.
   - Departure / arrival boards (airport FIDS, station boards) -> `departures`, plus one `stations` entry per station/airport with an overall status.
   - Airport or station operational status -> `stations`.
   Return `alerts: []` when a source is healthy and simply has no alerts (that is valid). Never return an entirely empty result when the source failed; throw instead.
5. Times are real `Date`s in UTC. Parse local times with the station's IANA timezone, never the machine's.
6. Keep payloads sane: departure boards cover roughly now-2h to now+12h; cap per source at ~3000 departures and ~20000 vehicles.
7. `intervalMinutes`: 1 for line status, alerts and vehicles of big networks; 2-5 for airport boards; 10-15 for slow-moving sources. Be polite: one connector run should cost at most ~10 HTTP requests, unless the source is a bulk feed meant for polling.
8. Source ids: `<iso2>-<city-or-scope>-<operator>[-<feed>]`, lowercase kebab, e.g. `co-medellin-metro`, `us-nyc-mta-subway`, `jp-tokyo-metro`, `ie-dublin-airport`.
9. Fill `SourceMeta` completely: real `homepage` (the human status page), `endpoints`, `license`/`attribution` when the source states one, `lat`/`lon` city center.
10. No new npm dependencies. Available: `fast-xml-parser`, `node-html-parser`, `gtfs-realtime-bindings`, `zod`, plus web platform APIs (`Intl`, `crypto.subtle`, `TextDecoder`).
11. Every connector gets a test in the same folder that runs it live via `runConnector` and asserts something meaningful (counts, a known line id). Pure parsing helpers get unit tests too.
12. No comments that narrate history. No em dashes anywhere. Keep code small and direct.

## planned.ts

Each group folder has a `planned.ts` exporting sources worth adding later:

```ts
import type { PlannedSource } from "@/lib/planned";
export const planned: PlannedSource[] = [
  { name: "SNCF Transilien", country: "fr", modes: ["rail"], url: "https://...", reason: "needs free API key" },
];
```
