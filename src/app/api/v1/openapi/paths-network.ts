import { countryParam, get, limitParam, list, modeParam, param, ref, type Json } from "./helpers";

const sev = ref("Severity");
const alertEx = {
  sourceId: "gb-london-tfl", sourceName: "TfL Status", country: "gb", city: "London", id: "a1", severity: "major", effect: "REDUCED_SERVICE",
  cause: null, title: "Central line: severe delays", description: "Signal failure at Bank.", url: null, modes: ["metro"], routes: ["Central"],
  stops: ["Bank"], activeFrom: "2026-11-04T10:00:00.000Z", activeUntil: null, active: true, firstSeenAt: "2026-11-04T10:01:00.000Z",
  lastSeenAt: "2026-11-04T11:59:00.000Z", resolvedAt: null,
};
const lineEx = {
  sourceId: "gb-london-tfl", sourceName: "TfL Status", country: "gb", city: "London", lineId: "central", lineName: "Central", mode: "metro",
  color: "DC241F", status: "major", statusText: "Severe delays", since: "2026-11-04T10:00:00.000Z", updatedAt: "2026-11-04T11:59:00.000Z",
};

export const networkPaths: Record<string, Json> = {
  "/api/v1/alerts": get({
    summary: "List active alerts",
    description: "Active service alerts ordered by severity, then newest. Keyset paginated: pass `meta.nextCursor` as `cursor`.",
    tag: "Alerts", operationId: "listAlerts", paged: true, data: list(ref("Alert")), example: [alertEx],
    parameters: [
      countryParam, param("city", "City name, case-insensitive match.", { type: "string" }, { example: "London" }), modeParam,
      param("severity", "Exact severity.", sev), param("minSeverity", "Minimum severity (info < minor < major < severe).", sev),
      param("sourceId", "Restrict to one source."), param("q", "Free-text match on title, description and routes."),
      param("since", "Only alerts first seen at or after this time.", { type: "string", format: "date-time" }),
      limitParam(500, 50), param("cursor", "Opaque cursor from a previous page."),
    ],
  }),
  "/api/v1/lines": get({
    summary: "List lines",
    description: "Current status of lines and routes (up to 2000).",
    tag: "Network", operationId: "listLines", data: list(ref("Line")), example: [lineEx],
    parameters: [
      param("sourceId", "Restrict to one source."), countryParam, modeParam,
      param("disrupted", "`true` returns only lines whose status is not good or unknown.", { type: "string", enum: ["true", "false"] }),
    ],
  }),
  "/api/v1/changes": get({
    summary: "Recent status changes",
    description: "Status transitions of lines and stations, newest first.",
    tag: "Network", operationId: "listChanges", data: list(ref("Change")),
    parameters: [
      param("since", "Only changes at or after this time.", { type: "string", format: "date-time" }),
      param("sourceId", "Restrict to one source."), countryParam, limitParam(500, 100),
    ],
    example: [{ id: "1", sourceId: "gb-london-tfl", sourceName: "TfL Status", country: "gb", city: "London", subject: "line", subjectId: "central", subjectName: "Central", fromStatus: "good", toStatus: "major", statusText: "Severe delays", at: "2026-11-04T10:00:00.000Z" }],
  }),
};

