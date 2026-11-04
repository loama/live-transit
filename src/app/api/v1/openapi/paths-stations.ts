import { countryParam, get, limitParam, list, modeParam, param, pathParam, ref, type Json } from "./helpers";

const stationEx = {
  sourceId: "gb-airport-lhr", stationId: "LHR", name: "London Heathrow", mode: "air", city: "London", country: "gb", lat: 51.47, lon: -0.45,
  status: "delays", statusText: "Minor delays", delayMinutes: 12, since: "2026-11-04T09:00:00.000Z", updatedAt: "2026-11-04T11:59:00.000Z",
};
const depEx = {
  sourceId: "gb-airport-lhr", id: "LHR:departure:BA117:2026-11-04T12:30:00Z", stationId: "LHR", stationName: "London Heathrow", direction: "departure",
  mode: "air", service: "BA117", carrier: "British Airways", counterpart: "New York JFK", scheduledAt: "2026-11-04T12:30:00.000Z",
  estimatedAt: "2026-11-04T12:45:00.000Z", platform: "A12", status: "delayed", statusText: "Delayed 15 min", delayMinutes: 15,
};
const vehEx = {
  sourceId: "us-sf-bart", id: "v1", mode: "metro", routeId: "RED", routeName: "Red Line", tripId: "t1", headsign: "Richmond", lat: 37.79,
  lon: -122.4, bearing: 90, speed: 12.4, label: "1234", delaySeconds: 60, observedAt: "2026-11-04T11:59:30.000Z",
};

export const stationPaths: Record<string, Json> = {
  "/api/v1/stations": get({
    summary: "List stations and airports",
    description: "Stations and airports with current status, worst first.",
    tag: "Stations", operationId: "listStations", data: list(ref("Station")), example: [stationEx],
    parameters: [
      modeParam, countryParam,
      param("status", "Station status.", { type: "string", enum: ["normal", "delays", "major_delays", "closed", "unknown"] }),
      param("q", "Match on name, city or exact id."), limitParam(1000, 200),
    ],
  }),
  "/api/v1/stations/{id}": get({
    summary: "Get a station",
    description: "A station or airport. When several sources report it, `reports` has one entry each.",
    tag: "Stations", operationId: "getStation", notFound: true, noBadRequest: true, data: ref("StationDetail"),
    parameters: [pathParam("id", "Station or airport id. IATA codes are case-insensitive.", "LHR")],
    example: { ...stationEx, reports: [stationEx] },
  }),
  "/api/v1/stations/{id}/board": get({
    summary: "Departures and arrivals board",
    description: "Live board for a station or airport, ordered by estimated or scheduled time.",
    tag: "Stations", operationId: "getBoard", notFound: true, data: list(ref("Departure")), example: [depEx],
    parameters: [
      pathParam("id", "Station or airport id.", "LHR"),
      param("direction", "Departures or arrivals only.", { type: "string", enum: ["departure", "arrival"] }),
      param("from", "Earliest time to include (default: 30 minutes ago).", { type: "string", format: "date-time" }),
      limitParam(500, 60),
    ],
  }),
  "/api/v1/services/{q}": get({
    summary: "Find a flight or train number",
    description: "Looks up a flight or train number across every board. Spaces and dashes are ignored, case-insensitive.",
    tag: "Stations", operationId: "findService", data: list(ref("Departure")), example: [depEx],
    parameters: [pathParam("q", "Flight or train number.", "BA117"), limitParam(200, 50)],
  }),
  "/api/v1/vehicles": get({
    summary: "Live vehicles",
    description: "Vehicle positions. Provide `bbox`, `sourceId`, or `lat`+`lon`+`radiusKm` (nearest first, adds `distanceKm`). Cached for 10 seconds.",
    tag: "Vehicles", operationId: "listVehicles", data: list(ref("Vehicle")), example: [vehEx],
    parameters: [
      param("bbox", "Bounding box `minLon,minLat,maxLon,maxLat`.", { type: "string" }, { example: "-122.5,37.7,-122.3,37.9" }),
      param("sourceId", "Vehicles of one source."),
      param("lat", "Centre latitude.", { type: "number", minimum: -90, maximum: 90 }),
      param("lon", "Centre longitude.", { type: "number", minimum: -180, maximum: 180 }),
      param("radiusKm", "Radius in km (0.1 to 100).", { type: "number", minimum: 0.1, maximum: 100 }),
      modeParam, limitParam(5000, 2000),
    ],
  }),
};
