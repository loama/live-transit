import { countryParam, get, limitParam, list, modeParam, param, pathParam, ref, type Json } from "./helpers";

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

const routeEx = {
  sourceId: "gb-london-tfl", routeId: "central", name: "Central", shortName: null, longName: "Central line", mode: "metro",
  color: "DC241F", textColor: "FFFFFF",
  bbox: [-0.512, 51.452, 0.071, 51.613],
};

export const networkPaths: Record<string, Json> = {
  "/api/v1/routes": get({
    summary: "List routes (static catalog)",
    description: "Routes from static GTFS feeds with representative shapes for mapping. Requires sourceId, bbox, or both. When filtering by bbox, routes are ordered by mode priority then name.",
    tag: "Network", operationId: "listRoutes", data: list(ref("Route")), example: [routeEx],
    parameters: [
      param("sourceId", "Restrict to one source."), param("bbox", "Bounding box as minLon,minLat,maxLon,maxLat. Routes intersecting this area."),
      modeParam, param("geometry", "Include encoded shapes. Default false.", { type: "string", enum: ["true", "false"] }),
      limitParam(5000, 500),
    ],
  }),
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
  "/api/v1/sources/{id}/lines/{lineId}": get({
    summary: "Line detail",
    description: "Complete information about one line: status, live vehicles, shapes for mapping, active alerts and recent status history.",
    tag: "Network", operationId: "getLineDetail", notFound: true, data: ref("LineDetail"),
    parameters: [pathParam("id", "Source id", "gb-london-tfl"), pathParam("lineId", "Line id", "central")],
    example: {
      sourceId: "gb-london-tfl", lineId: "central", name: "Central", longName: "Central line", mode: "metro", color: "DC241F", textColor: "FFFFFF",
      status: { ...lineEx, sourceId: "gb-london-tfl", sourceName: "TfL Status", country: "gb", city: "London" },
      shapes: ["_p~iF~ps|U_ulLnnqC"],
      vehicles: [{ sourceId: "gb-london-tfl", id: "1234", mode: "metro", routeName: "Central", lat: 51.5, lon: -0.1, bearing: 90, delaySeconds: 120, observedAt: "2026-11-04T12:00:00.000Z" }],
      alerts: [{ ...alertEx, sourceId: "gb-london-tfl", sourceName: "TfL Status", country: "gb", city: "London" }],
      history: [{ from: "good", to: "major", text: "Severe delays", at: "2026-11-04T10:00:00.000Z" }, { from: "minor", to: "good", text: "Good service", at: "2026-11-04T08:00:00.000Z" }],
    },
  }),
  "/api/v1/sources/{id}/live": get({
    summary: "Live vehicles for a source",
    description: "Vehicle positions read from the operator's realtime feed at request time when the source supports it (shared for about 10 seconds), otherwise the last ingested snapshot. `meta.live` says which one was served.",
    tag: "Vehicles", operationId: "getLiveVehicles", notFound: true, data: list(ref("Vehicle")),
    parameters: [pathParam("id", "Source id", "gtfs-bg-sofia-sofia-traffic"), param("routeId", "Only vehicles on this route id.", { type: "string" }, { example: "TM33" })],
    example: [
      { sourceId: "gb-london-tfl", id: "v1", mode: "metro", routeId: "central", routeName: "Central", color: "DC241F", lat: 51.5, lon: -0.1, bearing: 90, observedAt: "2026-11-04T12:00:00.000Z" },
      { sourceId: "gb-london-tfl", id: "v2", mode: "bus", routeName: "38", lat: 51.52, lon: -0.12, bearing: 180, delaySeconds: 60, observedAt: "2026-11-04T12:00:00.000Z" },
    ],
  }),
};

