import { countryParam, get, limitParam, list, modeParam, param, pathParam, ref, type Json } from "./helpers";

const sourceEx = {
  id: "gb-london-tfl", name: "TfL Status", operator: "Transport for London", country: "gb", city: "London", region: "europe",
  modes: ["metro", "rail"], kind: "api", homepage: "https://tfl.gov.uk", license: "TfL Open Data", attribution: "Powered by TfL Open Data",
  intervalMinutes: 2, lat: 51.5, lon: -0.12, health: "live", lastSuccessAt: "2026-11-04T11:59:00.000Z", lastRunAt: "2026-11-04T11:59:00.000Z",
  lastError: null, counts: { lines: 20, alerts: 14 }, activeAlerts: 14, disruptedLines: 3,
};

export const coreOverviewPath = get({
  summary: "Global overview",
  description: "Headline counts across all sources: source health, active alerts by severity, lines, stations, vehicles and departures.",
  tag: "Meta", operationId: "getOverview", noBadRequest: true, data: ref("Overview"),
  example: {
    sources: { total: 60, live: 54, stale: 3, failing: 1, pending: 2 }, countries: 22, cities: 40, activeAlerts: 310,
    alertsBySeverity: { info: 120, minor: 100, major: 80, severe: 10 }, lines: 400, linesDisrupted: 31, stations: 900,
    stationsDelayed: 44, vehicles: 12000, departures: 25000, lastIngestAt: "2026-11-04T11:59:00.000Z",
  },
});

export const corePaths: Record<string, Json> = {
  "/api/v1/overview": coreOverviewPath,
  "/api/v1/sources": get({
    summary: "List sources",
    description: "Official data sources (operators, airports) with freshness. Each source has a `health` of live, stale, failing or pending.",
    tag: "Sources", operationId: "listSources", data: list(ref("Source")), example: [sourceEx],
    parameters: [
      countryParam, modeParam,
      param("region", "Region slug.", { type: "string", enum: ["africa", "asia", "europe", "latam", "north-america", "oceania", "middle-east"] }),
      param("q", "Free-text match on name, operator and city."),
      param("health", "Filter by health.", ref("Health")),
    ],
  }),
  "/api/v1/sources/{id}": get({
    summary: "Get a source",
    description: "A source with its lines, active alerts, stations and the 30 most recent ingest runs.",
    tag: "Sources", operationId: "getSource", notFound: true, noBadRequest: true, data: ref("SourceDetail"),
    parameters: [pathParam("id", "Source id.", "gb-london-tfl")],
    example: { ...sourceEx, endpoints: ["https://api.tfl.gov.uk/Line/Mode/tube,dlr/Status"], lines: [], alerts: [], stations: [], recentRuns: [] },
  }),
  "/api/v1/health": get({
    summary: "Ingest health",
    description: "Per-source freshness and failure details. `summary` counts sources per health value.",
    tag: "Meta", operationId: "getHealth", noBadRequest: true, data: ref("HealthReport"),
    example: {
      summary: { live: 1, stale: 0, failing: 0, pending: 0 },
      sources: [{ id: "gb-london-tfl", name: "TfL Status", country: "gb", health: "live", intervalMinutes: 2, lastSuccessAt: "2026-11-04T11:59:00.000Z", lastRunAt: "2026-11-04T11:59:00.000Z", lastError: null, consecutiveFailures: 0, lastDurationMs: 420, counts: { lines: 20 } }],
    },
  }),
  "/api/v1/planned": get({
    summary: "Planned sources",
    description: "Known official sources not ingested yet, usually because they require a registration key.",
    tag: "Meta", operationId: "listPlanned", noBadRequest: true, data: list(ref("PlannedSource")),
    example: [{ name: "Example Metro", country: "xx", modes: ["metro"], url: "https://example.org/open-data", reason: "Requires an API key" }],
  }),
  "/api/v1/search": get({
    summary: "Search",
    description: "Ranked search across sources, stations/airports, lines and active alerts.",
    tag: "Search", operationId: "search", data: list(ref("SearchHit")),
    parameters: [{ ...param("q", "Search text, at least 2 characters.", { type: "string", minLength: 2 }, { example: "heathrow" }), required: true }, limitParam(100, 20)],
    example: [{ type: "station", id: "LHR", sourceId: "gb-airport-lhr", title: "London Heathrow", subtitle: "London · GB · air", status: "normal", score: 3.2 }],
  }),
};
