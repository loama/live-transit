import type { Json } from "./helpers";

const s = { type: "string" };
const sn = { type: ["string", "null"] };
const dt = { type: "string", format: "date-time" };
const dtn = { type: ["string", "null"], format: "date-time" };
const nn = { type: ["number", "null"] };
const inn = { type: ["integer", "null"] };
const strs = { type: "array", items: s };
const r = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const obj = (required: string[], properties: Json): Json => ({ type: "object", required, properties });

export const dataSchemas: Record<string, Json> = {
  Alert: obj(["sourceId", "id", "severity", "title", "modes", "routes", "stops", "active", "firstSeenAt", "lastSeenAt"], {
    sourceId: s, sourceName: s, country: s, city: sn, id: s,
    severity: r("Severity"),
    effect: { ...sn, description: "GTFS-RT style effect, e.g. NO_SERVICE, SIGNIFICANT_DELAYS." },
    cause: sn, title: s, description: sn, url: sn,
    modes: { type: "array", items: r("Mode") },
    routes: strs, stops: strs,
    activeFrom: dtn, activeUntil: dtn,
    active: { type: "boolean" },
    firstSeenAt: dt, lastSeenAt: { ...dt, description: "Last time the source still reported this alert." },
    resolvedAt: dtn,
  }),
  Line: obj(["sourceId", "lineId", "lineName", "mode", "status", "statusText", "since", "updatedAt"], {
    sourceId: s, sourceName: s, country: s, city: sn, lineId: s, lineName: s,
    mode: r("Mode"),
    color: { ...sn, description: "Hex colour without `#`." },
    status: { type: "string", enum: ["good", "minor", "major", "suspended", "closed", "unknown"] },
    statusText: s,
    since: { ...dt, description: "When the line entered its current status." },
    updatedAt: dt,
  }),
  Station: obj(["sourceId", "stationId", "name", "mode", "status", "since", "updatedAt"], {
    sourceId: s, sourceName: s,
    stationId: { ...s, description: "IATA code for airports, operator id otherwise." },
    name: s, mode: r("Mode"), city: sn, country: sn, lat: nn, lon: nn,
    status: { type: "string", enum: ["normal", "delays", "major_delays", "closed", "unknown"] },
    statusText: sn,
    delayMinutes: { ...inn, description: "Average delay in minutes when published." },
    since: dt, updatedAt: dt,
  }),
  StationDetail: {
    allOf: [r("Station"), obj(["reports"], { reports: { type: "array", items: r("Station"), description: "One entry per source reporting this station." } })],
  },
  Departure: obj(["sourceId", "id", "stationId", "stationName", "direction", "mode", "service", "scheduledAt", "status"], {
    sourceId: s, id: s, stationId: s, stationName: s,
    direction: { type: "string", enum: ["departure", "arrival"] },
    mode: r("Mode"),
    service: { ...s, description: "Flight number, train number or line name." },
    carrier: sn,
    counterpart: { ...sn, description: "Destination for departures, origin for arrivals." },
    scheduledAt: dt, estimatedAt: dtn, platform: sn,
    status: { type: "string", enum: ["scheduled", "on_time", "delayed", "boarding", "departed", "arrived", "landed", "cancelled", "diverted", "unknown"] },
    statusText: sn, delayMinutes: inn,
  }),
  Vehicle: obj(["sourceId", "id", "mode", "lat", "lon"], {
    sourceId: s, id: s, mode: r("Mode"), routeId: sn, routeName: sn, tripId: sn, headsign: sn,
    lat: { type: "number" }, lon: { type: "number" },
    bearing: nn, speed: { ...nn, description: "Metres per second." }, label: sn, delaySeconds: inn, observedAt: dtn,
    distanceKm: { type: "number", description: "Only present for lat/lon/radiusKm queries." },
  }),
  Change: obj(["id", "sourceId", "subject", "subjectId", "subjectName", "toStatus", "at"], {
    id: s, sourceId: s, sourceName: s, country: s, city: sn,
    subject: { type: "string", enum: ["line", "station"] },
    subjectId: s, subjectName: s, fromStatus: sn, toStatus: s, statusText: sn, at: dt,
  }),
  SearchHit: obj(["type", "id", "sourceId", "title", "subtitle", "status", "score"], {
    type: { type: "string", enum: ["source", "station", "line", "alert"] },
    id: s, sourceId: s, title: s, subtitle: s, status: sn, score: { type: "number" },
  }),
  HealthReport: obj(["summary", "sources"], {
    summary: { type: "object", additionalProperties: { type: "integer" }, description: "Source count per health value." },
    sources: {
      type: "array",
      items: obj(["id", "name", "country", "health", "intervalMinutes", "consecutiveFailures"], {
        id: s, name: s, country: s, health: r("Health"), intervalMinutes: { type: "integer" },
        lastSuccessAt: dtn, lastRunAt: dtn, lastError: sn, consecutiveFailures: { type: "integer" },
        lastDurationMs: inn, counts: { type: "object", additionalProperties: { type: "integer" } },
      }),
    },
  }),
  PlannedSource: obj(["name", "country", "modes", "url", "reason"], {
    name: s, country: s, modes: { type: "array", items: r("Mode") }, url: s,
    reason: { ...s, description: "Why it is not ingested yet, usually a registration key." },
  }),
};
