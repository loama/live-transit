import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, uniqueDepartures, type AirportInfo } from "./fids";

const URL = "https://www.flysfo.com/flysfo/api/flight-status";

export const SFO: AirportInfo = { iata: "SFO", name: "San Francisco International Airport", city: "San Francisco", country: "us", tz: "America/Los_Angeles", lat: 37.6213, lon: -122.379 };

export interface SfoFlight {
  flight_kind: "Departure" | "Arrival";
  flight_number: string;
  airline: { iata_code: string; airline_name?: string; airline_display_name?: string };
  gate?: { gate_number?: string } | null;
  scheduled_aod_time: string | null;
  estimated_aod_time?: string | null;
  actual_aod_time?: string | null;
  remark?: string | null;
  airport?: { iata_code?: string; airport_city?: string } | null;
  diverted_airport?: unknown;
}

export function mapSfoStatus(remark: string | null | undefined, delay: number | undefined, diverted: boolean): DepartureState {
  const r = (remark ?? "").trim().toLowerCase();
  if (r === "cancelled") return "cancelled";
  if (diverted || r === "diverted") return "diverted";
  if (r === "departed") return "departed";
  if (r === "arrived") return "arrived";
  if (r === "landed") return "landed";
  if (r === "delayed") return "delayed";
  if (r === "last call" || r === "departing" || r === "boarding") return "boarding";
  if (r === "on time") return delay !== undefined && delay >= 15 ? "delayed" : "on_time";
  return delayedOrOn(delay);
}

export function mapSfoFlight(f: SfoFlight): Departure | undefined {
  if (!f.scheduled_aod_time || !f.flight_number) return undefined;
  const scheduledAt = new Date(f.scheduled_aod_time);
  if (Number.isNaN(scheduledAt.getTime())) return undefined;
  const arrival = f.flight_kind === "Arrival";
  const direction = arrival ? "arrival" : "departure";
  const at = f.actual_aod_time ?? f.estimated_aod_time;
  const est = at ? new Date(at) : undefined;
  const estimatedAt = est && !Number.isNaN(est.getTime()) ? est : undefined;
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapSfoStatus(f.remark, delayMinutes, !!f.diverted_airport);
  const service = `${f.airline.iata_code}${f.flight_number}`;
  return {
    id: departureId(SFO.iata, direction, service, scheduledAt),
    stationId: SFO.iata,
    stationName: SFO.name,
    direction,
    mode: "air",
    service,
    carrier: f.airline.airline_display_name ?? f.airline.airline_name ?? f.airline.iata_code,
    counterpart: f.airport?.airport_city ?? f.airport?.iata_code,
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    platform: f.gate?.gate_number || undefined,
    status,
    statusText: f.remark ?? undefined,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

export const sfo: Connector = {
  meta: {
    id: "us-sanfrancisco-sfo-airport",
    name: "San Francisco International Airport flights",
    operator: "San Francisco International Airport",
    country: "us",
    city: "San Francisco",
    region: "north-america",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.flysfo.com/flights",
    endpoints: [URL],
    attribution: "Flight status from flysfo.com",
    intervalMinutes: 5,
    lat: 37.6213,
    lon: -122.379,
  },
  async fetch(ctx) {
    const data = await fetchJson<{ data: SfoFlight[] }>(ctx, URL);
    const from = ctx.now.getTime() - 2 * 3_600_000;
    const to = ctx.now.getTime() + 12 * 3_600_000;
    const departures = uniqueDepartures(
      data.data.map(mapSfoFlight).filter((d): d is Departure => !!d && d.scheduledAt.getTime() >= from && d.scheduledAt.getTime() <= to),
    );
    return { departures, stations: [airportStatus(SFO, departures, ctx.now)] };
  },
};
