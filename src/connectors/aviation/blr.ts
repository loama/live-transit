import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, parseLocal, uniqueDepartures, type AirportInfo } from "./fids";

const URL = "https://gateway.bengaluruairport.com/fis/v2/api/aodb/flights";

export const BLR: AirportInfo = { iata: "BLR", name: "Kempegowda International Airport", city: "Bengaluru", country: "in", tz: "Asia/Kolkata", lat: 13.1986, lon: 77.7066 };

export interface BlrFlight {
  flight_unique_no: string;
  airline_name?: string;
  flight_status_id?: string;
  org_airport_id: string;
  dest_airport_id: string;
  schedule_hour_id: string;
  estimated_hour_id?: string;
  gate_id?: string;
  bound_id: "A" | "D";
  srcdest_airport_name?: string;
}

export function mapBlrStatus(status: string | undefined, arrival: boolean, delay: number | undefined): DepartureState {
  const s = (status ?? "").toUpperCase();
  if (s === "CANCELLED" || s === "CANCELED") return "cancelled";
  if (s === "ARRIVED") return "arrived";
  if (s === "LANDED") return "landed";
  if (s === "DEPARTED") return "departed";
  if (s === "DELAYED") return "delayed";
  if (!arrival && (s === "BOARDING" || s === "FINALCALL" || s === "GATECLOSED")) return "boarding";
  return delayedOrOn(delay);
}

export function mapBlrFlight(f: BlrFlight): Departure | undefined {
  const scheduledAt = parseLocal(f.schedule_hour_id, BLR.tz);
  if (!scheduledAt || !f.flight_unique_no) return undefined;
  const arrival = f.bound_id === "A";
  const direction = arrival ? "arrival" : "departure";
  const estimatedAt = parseLocal(f.estimated_hour_id, BLR.tz);
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapBlrStatus(f.flight_status_id, arrival, delayMinutes);
  return {
    id: departureId(BLR.iata, direction, f.flight_unique_no, scheduledAt),
    stationId: BLR.iata,
    stationName: BLR.name,
    direction,
    mode: "air",
    service: f.flight_unique_no,
    carrier: f.airline_name,
    counterpart: f.srcdest_airport_name ?? (arrival ? f.org_airport_id : f.dest_airport_id),
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    platform: !arrival && f.gate_id ? f.gate_id : undefined,
    status,
    statusText: f.flight_status_id,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

export const blr: Connector = {
  meta: {
    id: "in-bengaluru-blr-airport",
    name: "Bengaluru Airport flights",
    operator: "Bangalore International Airport Limited",
    country: "in",
    city: "Bengaluru",
    region: "asia",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.bengaluruairport.com/flight-information",
    endpoints: [URL],
    attribution: "Flight information from Bengaluru Airport",
    intervalMinutes: 5,
    lat: 13.1986,
    lon: 77.7066,
  },
  async fetch(ctx) {
    const res = await fetchJson<{ data?: { arr?: BlrFlight[]; dep?: BlrFlight[] } }>(ctx, URL, {
      headers: { Origin: "https://www.bengaluruairport.com", Referer: "https://www.bengaluruairport.com/" },
    });
    if (!res.data?.arr || !res.data.dep) throw new Error("Bengaluru Airport: unexpected response");
    const departures = uniqueDepartures([...res.data.dep, ...res.data.arr].map(mapBlrFlight).filter((d): d is Departure => !!d));
    return { departures, stations: [airportStatus(BLR, departures, ctx.now)] };
  },
};
