import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, inWindow, uniqueDepartures, type AirportInfo } from "./fids";

const BASE = "https://www.bne.com.au/sites/default/files";

export const BNE: AirportInfo = { iata: "BNE", name: "Brisbane Airport", city: "Brisbane", country: "au", tz: "Australia/Brisbane", lat: -27.3842, lon: 153.1175 };

export interface BneFlight {
  AirlineCode: string;
  AirlineName?: string;
  FlightNumber: string;
  ToFrom?: string;
  DepartureOrArrival: "Departures" | "Arrivals";
  PassengerGate?: string | null;
  Status?: string;
  ScheduledTime: string;
  EstimatedTime?: string | null;
}

export function mapBneStatus(status: string | undefined, arrival: boolean, delay: number | undefined): DepartureState {
  const s = (status ?? "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "departed") return "departed";
  if (s === "arrived") return "arrived";
  if (s === "landed") return "landed";
  if (s === "delayed") return "delayed";
  if (s === "boarding" || s === "gate open" || s === "final call") return arrival ? "unknown" : "boarding";
  return delayedOrOn(delay);
}

export function mapBneFlight(f: BneFlight): Departure | undefined {
  const scheduledAt = new Date(f.ScheduledTime);
  if (!f.FlightNumber || Number.isNaN(scheduledAt.getTime())) return undefined;
  const arrival = f.DepartureOrArrival === "Arrivals";
  const direction = arrival ? "arrival" : "departure";
  const estimatedAt = f.EstimatedTime ? new Date(f.EstimatedTime) : undefined;
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapBneStatus(f.Status, arrival, delayMinutes);
  const service = `${f.AirlineCode}${f.FlightNumber}`;
  return {
    id: departureId(BNE.iata, direction, service, scheduledAt),
    stationId: BNE.iata,
    stationName: BNE.name,
    direction,
    mode: "air",
    service,
    carrier: f.AirlineName,
    counterpart: f.ToFrom,
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    platform: !arrival && f.PassengerGate ? f.PassengerGate : undefined,
    status,
    statusText: f.Status,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

export const bne: Connector = {
  meta: {
    id: "au-brisbane-bne-airport",
    name: "Brisbane Airport flights",
    operator: "Brisbane Airport Corporation",
    country: "au",
    city: "Brisbane",
    region: "oceania",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.bne.com.au/passenger/flights/departures",
    endpoints: [`${BASE}/00API-Today.json`, `${BASE}/00API-Tomorrow.json`],
    attribution: "Flight information from Brisbane Airport Corporation",
    intervalMinutes: 5,
    lat: -27.3842,
    lon: 153.1175,
  },
  async fetch(ctx) {
    const [today, tomorrow] = await Promise.all([
      fetchJson<BneFlight[]>(ctx, `${BASE}/00API-Today.json`),
      fetchJson<BneFlight[]>(ctx, `${BASE}/00API-Tomorrow.json`),
    ]);
    const rows = [...today, ...tomorrow].map(mapBneFlight).filter((d): d is Departure => !!d);
    const departures = uniqueDepartures(inWindow(rows, ctx.now));
    return { departures, stations: [airportStatus(BNE, departures, ctx.now)] };
  },
};
