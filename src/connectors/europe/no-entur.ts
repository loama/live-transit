import { alertsFromFeed, decodeFeed, vehiclesFromFeed, type GtfsRtOptions } from "@/lib/gtfs-rt";
import { fetchBuffer, fetchJson } from "@/lib/http";
import type { Connector, Departure, Mode, Vehicle } from "@/lib/types";
import { delayMinutes, departureState, stationFromBoard } from "./util";

const RT = "https://api.entur.io/realtime/v1/gtfs-rt";
const GRAPHQL = "https://api.entur.io/journey-planner/v3/graphql";
const HEADERS = { "ET-Client-Name": "livetransit-aggregator" };

const STOPS = [
  { id: "NSR:StopPlace:337", code: "OSL-S", name: "Oslo S", city: "Oslo", mode: "rail" as Mode, lat: 59.9111, lon: 10.7528 },
  { id: "NSR:StopPlace:548", code: "BGO", name: "Bergen stasjon", city: "Bergen", mode: "rail" as Mode, lat: 60.3903, lon: 5.3340 },
  { id: "NSR:StopPlace:659", code: "TRD-S", name: "Trondheim S", city: "Trondheim", mode: "rail" as Mode, lat: 63.4361, lon: 10.3988 },
  { id: "NSR:StopPlace:418", code: "SVG", name: "Stavanger stasjon", city: "Stavanger", mode: "rail" as Mode, lat: 58.9702, lon: 5.7351 },
  { id: "NSR:StopPlace:58366", code: "OSL-JBT", name: "Jernbanetorget (Oslo)", city: "Oslo", mode: "metro" as Mode, lat: 59.9115, lon: 10.7506 },
];

const RAIL_CODESPACES = new Set(["VYG", "NSB", "GOA", "SJN", "FLT", "SJV", "CRN"]);

export function enturMode(id?: string): Mode {
  return RAIL_CODESPACES.has((id ?? "").split(":")[0]) ? "rail" : "bus";
}

const GQL_MODE: Record<string, Mode> = {
  rail: "rail", metro: "metro", tram: "tram", bus: "bus", coach: "bus", water: "ferry", air: "air", cableway: "cable", lift: "cable",
};

interface Call {
  aimedDepartureTime: string;
  expectedDepartureTime: string;
  realtime: boolean;
  cancellation: boolean;
  destinationDisplay?: { frontText?: string };
  quay?: { publicCode?: string };
  serviceJourney: { id: string; line: { publicCode?: string; transportMode: string; authority?: { name?: string } } };
}

export function callsToDepartures(stop: { id: string; code: string; name: string }, calls: Call[]): Departure[] {
  return calls.map((c) => {
    const scheduledAt = new Date(c.aimedDepartureTime);
    const estimatedAt = new Date(c.expectedDepartureTime);
    const delay = delayMinutes(scheduledAt, estimatedAt);
    const line = c.serviceJourney.line;
    return {
      id: `${stop.code}:${c.serviceJourney.id}:${c.aimedDepartureTime}`,
      stationId: stop.code,
      stationName: stop.name,
      direction: "departure" as const,
      mode: GQL_MODE[line.transportMode] ?? "other",
      service: line.publicCode || c.serviceJourney.id,
      carrier: line.authority?.name,
      counterpart: c.destinationDisplay?.frontText,
      scheduledAt,
      estimatedAt: c.realtime ? estimatedAt : undefined,
      platform: c.quay?.publicCode || undefined,
      status: departureState({ cancelled: c.cancellation, delay, realtime: c.realtime }),
      delayMinutes: c.realtime ? delay : undefined,
    };
  });
}

const query = `{ ${STOPS.map(
  (s, i) => `s${i}: stopPlace(id: "${s.id}") { estimatedCalls(numberOfDepartures: 25, timeRange: 14400) {
    aimedDepartureTime expectedDepartureTime realtime cancellation destinationDisplay { frontText } quay { publicCode }
    serviceJourney { id line { publicCode transportMode authority { name } } } } }`,
).join("\n")} }`;

export const noEntur: Connector = {
  meta: {
    id: "no-entur",
    name: "Norway national public transport (Entur)",
    operator: "Entur",
    country: "no",
    region: "europe",
    modes: ["rail", "metro", "tram", "bus", "ferry"],
    kind: "api",
    homepage: "https://developer.entur.org/",
    endpoints: [`${RT}/alerts`, `${RT}/vehicle-positions`, GRAPHQL],
    license: "NLOD 2.0",
    attribution: "Data from Entur, licensed under NLOD 2.0",
    intervalMinutes: 2,
    lat: 60.472,
    lon: 8.4689,
  },
  async fetch(ctx) {
    const init = { headers: HEADERS };
    const [alertsBuf, vehiclesBuf, gql] = await Promise.all([
      fetchBuffer(ctx, `${RT}/alerts`, init),
      fetchBuffer(ctx, `${RT}/vehicle-positions`, init),
      fetchJson<{ data: Record<string, { estimatedCalls: Call[] } | null> }>(ctx, GRAPHQL, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      }),
    ]);
    const opts: GtfsRtOptions = { defaultMode: "bus", languages: ["en", "nb", "no"] };
    const alerts = alertsFromFeed(decodeFeed(alertsBuf), opts, ctx.now).map((a) => ({ ...a, modes: [enturMode(a.id)] }));
    const vehicles: Vehicle[] = vehiclesFromFeed(decodeFeed(vehiclesBuf), opts).map((v) => ({
      ...v,
      id: `${v.tripId}:${v.id}`,
      mode: enturMode(v.tripId),
    }));
    const departures: Departure[] = [];
    const stations = STOPS.map((s, i) => {
      const d = callsToDepartures(s, gql.data[`s${i}`]?.estimatedCalls ?? []);
      departures.push(...d);
      return stationFromBoard({ stationId: s.code, name: s.name, mode: s.mode, city: s.city, country: "no", lat: s.lat, lon: s.lon }, d);
    });
    return { alerts, vehicles, departures, stations };
  },
};
