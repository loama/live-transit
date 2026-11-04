import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, uniqueDepartures, type AirportInfo } from "./fids";

const BASE = "https://www.frankfurt-airport.com/en/_jcr_content.flights.json/filter";
const PAGES = 4;

export const FRA: AirportInfo = { iata: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "de", tz: "Europe/Berlin", lat: 50.0379, lon: 8.5622 };

interface FraFlight {
  fnr: string;
  alname?: string;
  apname?: string;
  sched: string;
  esti?: string;
  status?: string;
  gate?: string;
  ac?: string;
}
interface FraPage {
  data: FraFlight[];
}

export function mapFraStatus(raw: string | undefined, arrival: boolean, delay: number | undefined): { status: DepartureState; statusText?: string } {
  const s = (raw ?? "").trim();
  const l = s.toLowerCase();
  const statusText = s || undefined;
  if (!l) return { status: delayedOrOn(delay) };
  if (l.includes("cancel")) return { status: "cancelled", statusText };
  if (l.includes("divert")) return { status: "diverted", statusText };
  if (l === "landed") return { status: "landed", statusText };
  if (l === "on position" || l === "baggage delivery") return { status: "arrived", statusText };
  if (l.includes("delayed")) return { status: "delayed", statusText };
  if (!arrival && (l === "boarding" || l === "gate open" || l === "closed")) return { status: "boarding", statusText };
  if (!arrival && (l === "off block" || l === "departed")) return { status: "departed", statusText };
  if (arrival && (l === "departed" || l === "approaching" || l === "scheduled")) return { status: delayedOrOn(delay), statusText };
  return { status: "unknown", statusText };
}

export function mapFraFlight(f: FraFlight, arrival: boolean): Departure | undefined {
  const scheduledAt = new Date(f.sched);
  if (!f.fnr || Number.isNaN(scheduledAt.getTime())) return undefined;
  const est = f.esti ? new Date(f.esti) : undefined;
  const estimatedAt = est && !Number.isNaN(est.getTime()) ? est : undefined;
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const { status, statusText } = mapFraStatus(f.status, arrival, delayMinutes);
  const direction = arrival ? "arrival" : "departure";
  return {
    id: departureId(FRA.iata, direction, f.fnr, scheduledAt),
    stationId: FRA.iata,
    stationName: FRA.name,
    direction,
    mode: f.ac === "TRS" ? "rail" : "air",
    service: f.fnr.replace(/\s+/g, ""),
    carrier: f.alname,
    counterpart: f.apname,
    scheduledAt,
    estimatedAt,
    platform: !arrival && f.gate ? f.gate : undefined,
    status,
    statusText,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

export const fra: Connector = {
  meta: {
    id: "de-frankfurt-fraport",
    name: "Frankfurt Airport flights",
    operator: "Fraport AG",
    country: "de",
    city: "Frankfurt",
    region: "europe",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.frankfurt-airport.com/en/flights-and-transfer/departures.html",
    endpoints: [BASE],
    attribution: "Flight information from Fraport AG",
    intervalMinutes: 5,
    lat: 50.0379,
    lon: 8.5622,
  },
  async fetch(ctx) {
    const pages = (type: "departures" | "arrivals") =>
      Array.from({ length: PAGES }, (_, i) => fetchJson<FraPage>(ctx, `${BASE}?perpage=50&lang=en&flighttype=${type}&page=${i + 1}`));
    const [dep, arr] = await Promise.all([Promise.all(pages("departures")), Promise.all(pages("arrivals"))]);
    const to = ctx.now.getTime() + 12 * 3_600_000;
    const rows = [
      ...dep.flatMap((p) => p.data.map((f) => mapFraFlight(f, false))),
      ...arr.flatMap((p) => p.data.map((f) => mapFraFlight(f, true))),
    ].filter((d): d is Departure => !!d && d.scheduledAt.getTime() <= to);
    const departures = uniqueDepartures(rows);
    return { departures, stations: [airportStatus(FRA, departures, ctx.now)] };
  },
};
