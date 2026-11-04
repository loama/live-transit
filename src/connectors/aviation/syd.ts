import { fetchJson } from "@/lib/http";
import type { Connector, ConnectorContext, Departure, DepartureState } from "@/lib/types";
import { airportStatus, clockNear, delayBetween, delayedOrOn, departureId, inWindow, parseLocal, uniqueDepartures, windowDates, type AirportInfo } from "./fids";

const BASE = "https://www.sydneyairport.com.au/_a/flights/";

export const SYD: AirportInfo = { iata: "SYD", name: "Sydney Airport", city: "Sydney", country: "au", tz: "Australia/Sydney", lat: -33.9461, lon: 151.1772 };

export interface SydFlight {
  airline?: string;
  flightNumbers: string[];
  destinations?: string[];
  terminalNumber?: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedTime?: string;
  estimatedDate?: string;
  status?: string;
}

export function mapSydStatus(status: string | undefined, delay: number | undefined): DepartureState {
  const s = (status ?? "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "departed") return "departed";
  if (s === "arrived") return "arrived";
  if (s === "landed") return "landed";
  if (s === "delayed") return "delayed";
  if (s === "boarding" || s === "final call") return "boarding";
  return delayedOrOn(delay);
}

export function mapSydFlight(f: SydFlight, arrival: boolean): Departure | undefined {
  const scheduledAt = parseLocal(`${f.scheduledDate} ${f.scheduledTime}`, SYD.tz);
  const service = f.flightNumbers?.[0];
  if (!scheduledAt || !service) return undefined;
  const hasEstimate = f.estimatedTime && f.estimatedTime !== "-";
  const estimatedAt = hasEstimate ? clockNear(f.estimatedTime!, scheduledAt, SYD.tz) : undefined;
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapSydStatus(f.status, delayMinutes);
  const direction = arrival ? "arrival" : "departure";
  return {
    id: departureId(SYD.iata, direction, service, scheduledAt),
    stationId: SYD.iata,
    stationName: SYD.name,
    direction,
    mode: "air",
    service,
    carrier: f.airline?.trim(),
    counterpart: f.destinations?.[0],
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    status,
    statusText: f.status,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

async function board(ctx: ConnectorContext, type: "departure" | "arrival", terminal: "domestic" | "international", date: string): Promise<Departure[]> {
  const res = await fetchJson<{ flightData?: SydFlight[] }>(ctx, `${BASE}?flightType=${type}&date=${date}&terminalType=${terminal}`);
  if (!res.flightData) throw new Error("Sydney Airport: unexpected response");
  return res.flightData.map((f) => mapSydFlight(f, type === "arrival")).filter((d): d is Departure => !!d);
}

export const syd: Connector = {
  meta: {
    id: "au-sydney-syd-airport",
    name: "Sydney Airport flights",
    operator: "Sydney Airport",
    country: "au",
    city: "Sydney",
    region: "oceania",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.sydneyairport.com.au/flights/?flightType=departure",
    endpoints: [BASE],
    attribution: "Flight information from Sydney Airport",
    intervalMinutes: 5,
    lat: -33.9461,
    lon: 151.1772,
  },
  async fetch(ctx) {
    const dates = windowDates(ctx.now, SYD.tz);
    const jobs = dates.flatMap((d) => (["departure", "arrival"] as const).flatMap((t) => (["domestic", "international"] as const).map((k) => board(ctx, t, k, d))));
    const departures = uniqueDepartures(inWindow((await Promise.all(jobs)).flat(), ctx.now));
    return { departures, stations: [airportStatus(SYD, departures, ctx.now)] };
  },
};
