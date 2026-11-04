import type { Json } from "./helpers";

const s = { type: "string" };
const sn = { type: ["string", "null"] };
const dt = { type: "string", format: "date-time" };
const dtn = { type: ["string", "null"], format: "date-time" };
const nn = { type: ["number", "null"] };
const strs = { type: "array", items: s };
const obj = (required: string[], properties: Json, description?: string): Json => ({
  type: "object",
  ...(description ? { description } : {}),
  required,
  properties,
});
const r = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const schemas: Record<string, Json> = {
  Mode: { type: "string", enum: ["air", "rail", "metro", "tram", "bus", "ferry", "cable", "other"] },
  Health: {
    type: "string",
    enum: ["live", "stale", "failing", "pending"],
    description: "live: fresh data. stale: last success older than 3 polling intervals. failing: 3+ consecutive failures. pending: never succeeded.",
  },
  Severity: { type: "string", enum: ["info", "minor", "major", "severe"] },
  Meta: obj(["generatedAt", "count"], {
    generatedAt: { ...dt, description: "When the response was generated." },
    count: { type: "integer", description: "Number of items in `data`." },
    attribution: { ...strs, description: "Data attributions required by the licences of the sources used." },
  }),
  PagedMeta: obj(["generatedAt", "count"], {
    generatedAt: dt,
    count: { type: "integer" },
    nextCursor: { ...s, description: "Pass as `cursor` to fetch the next page. Absent on the last page." },
    attribution: strs,
  }),
  Error: obj(["error"], { error: obj(["code", "message"], { code: { type: "string", enum: ["bad_request", "not_found", "internal_error"] }, message: s }) }),
  Overview: obj(["sources", "countries", "cities", "activeAlerts", "alertsBySeverity", "lines", "linesDisrupted", "stations", "stationsDelayed", "vehicles", "departures", "lastIngestAt"], {
    sources: obj(["total", "live", "stale", "failing", "pending"], Object.fromEntries(["total", "live", "stale", "failing", "pending"].map((k) => [k, { type: "integer" }]))),
    countries: { type: "integer" },
    cities: { type: "integer" },
    activeAlerts: { type: "integer" },
    alertsBySeverity: { type: "object", additionalProperties: { type: "integer" } },
    lines: { type: "integer" },
    linesDisrupted: { type: "integer" },
    stations: { type: "integer" },
    stationsDelayed: { type: "integer" },
    vehicles: { type: "integer" },
    departures: { type: "integer" },
    lastIngestAt: dtn,
  }),
  Source: obj(["id", "name", "operator", "country", "city", "region", "modes", "kind", "homepage", "intervalMinutes", "health", "lastSuccessAt", "counts", "activeAlerts", "disruptedLines"], {
    id: s, name: s, operator: s,
    country: { ...s, description: "ISO 3166-1 alpha-2, lowercase; `xx` for multi-country feeds." },
    city: sn,
    region: { type: "string", enum: ["africa", "asia", "europe", "latam", "north-america", "oceania", "middle-east"] },
    modes: { type: "array", items: r("Mode") },
    kind: { type: "string", enum: ["gtfs-rt", "api", "scrape", "fids"] },
    homepage: s, license: sn, attribution: sn,
    intervalMinutes: { type: "integer" },
    lat: nn, lon: nn,
    health: r("Health"),
    lastSuccessAt: dtn, lastRunAt: dtn, lastError: sn,
    counts: { type: "object", additionalProperties: { type: "integer" }, description: "Item counts of the last successful run." },
    activeAlerts: { type: "integer" },
    disruptedLines: { type: "integer" },
  }),
  IngestRun: obj(["startedAt", "durationMs", "ok", "error", "counts"], {
    startedAt: dtn, durationMs: { type: "integer" }, ok: { type: "boolean" }, error: sn,
    counts: { type: "object", additionalProperties: { type: "integer" } },
  }),
  SourceDetail: {
    allOf: [
      r("Source"),
      obj(["endpoints", "lines", "alerts", "stations", "recentRuns"], {
        endpoints: strs,
        lines: { type: "array", items: r("Line") },
        alerts: { type: "array", items: r("Alert") },
        stations: { type: "array", items: r("Station") },
        recentRuns: { type: "array", items: r("IngestRun") },
      }),
    ],
  },
};
