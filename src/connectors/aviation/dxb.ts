import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, inWindow, parseLocal, uniqueDepartures, type AirportInfo } from "./fids";

const URL = "https://dubaiairports.ae/docs/passengerslibraries/flights-library/flights-data.json";

export const DXB: AirportInfo = { iata: "DXB", name: "Dubai International Airport", city: "Dubai", country: "ae", tz: "Asia/Dubai", lat: 25.2532, lon: 55.3657 };
export const DWC: AirportInfo = { iata: "DWC", name: "Al Maktoum International Airport", city: "Dubai", country: "ae", tz: "Asia/Dubai", lat: 24.8967, lon: 55.1614 };
const AIRPORTS = [DXB, DWC];

export interface DxbFlight {
  flightNumber: string;
  airlineName?: string;
  arrivalDepartureFlag: "A" | "D";
  origin_iata: string;
  originName?: string;
  destination_iata: string;
  destinationName?: string;
  flightStatus?: string;
  gateNumber?: string;
  scheduledoffblockTime?: string;
  estimatedOffBlockTime?: string;
  actualOffBlockTime?: string;
  scheduledOnblockTime?: string;
  estimatedOnBlockTime?: string;
  actualOnBlockTime?: string;
}
interface Feed {
  Flights: DxbFlight[];
}

export function mapDxbStatus(status: string | undefined, arrival: boolean, delay: number | undefined): DepartureState {
  const s = (status ?? "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "departed") return "departed";
  if (s === "arrived") return "arrived";
  if (s === "landed") return "landed";
  if (s === "delayed") return "delayed";
  if (s === "diverted") return "diverted";
  if (!arrival && ["boarding", "gate open", "gate closed", "final call"].includes(s)) return "boarding";
  return delayedOrOn(delay);
}

/** The feed labels Dubai local wall-clock times with a trailing Z, so the suffix is dropped and the zone applied. */
export function mapDxbFlight(f: DxbFlight): Departure | undefined {
  const arrival = f.arrivalDepartureFlag === "A";
  const info = AIRPORTS.find((a) => a.iata === (arrival ? f.destination_iata : f.origin_iata));
  const scheduledAt = parseLocal(arrival ? f.scheduledOnblockTime : f.scheduledoffblockTime, DXB.tz);
  if (!info || !scheduledAt || !f.flightNumber) return undefined;
  const estimatedAt = parseLocal((arrival ? f.actualOnBlockTime ?? f.estimatedOnBlockTime : f.actualOffBlockTime ?? f.estimatedOffBlockTime) ?? undefined, DXB.tz);
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapDxbStatus(f.flightStatus, arrival, delayMinutes);
  const direction = arrival ? "arrival" : "departure";
  const service = f.flightNumber.replace(/\s+/g, "");
  return {
    id: departureId(info.iata, direction, service, scheduledAt),
    stationId: info.iata,
    stationName: info.name,
    direction,
    mode: "air",
    service,
    carrier: f.airlineName?.trim(),
    counterpart: arrival ? f.originName : f.destinationName,
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    platform: !arrival && f.gateNumber ? f.gateNumber.trim() : undefined,
    status,
    statusText: f.flightStatus,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

export const dxb: Connector = {
  meta: {
    id: "ae-dubai-airports",
    name: "Dubai Airports (DXB and DWC) flights",
    operator: "Dubai Airports",
    country: "ae",
    city: "Dubai",
    region: "middle-east",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.dubaiairports.ae/flight-information",
    endpoints: [URL],
    attribution: "Flight information from Dubai Airports",
    intervalMinutes: 5,
    lat: 25.2532,
    lon: 55.3657,
  },
  async fetch(ctx) {
    const feed = await fetchJson<Feed>(ctx, URL);
    if (!Array.isArray(feed.Flights)) throw new Error("Dubai Airports: unexpected response");
    const rows = feed.Flights.map(mapDxbFlight).filter((d): d is Departure => !!d);
    const departures = uniqueDepartures(inWindow(rows, ctx.now));
    return { departures, stations: AIRPORTS.map((a) => airportStatus(a, departures, ctx.now)) };
  },
};
