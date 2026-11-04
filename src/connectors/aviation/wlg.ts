import { fetchText } from "@/lib/http";
import type { Connector, ConnectorContext, Departure, DepartureState } from "@/lib/types";
import { airportStatus, clockNear, delayBetween, delayedOrOn, departureId, inWindow, parseLocal, uniqueDepartures, windowDates, type AirportInfo } from "./fids";

const BASE = "https://www.wellingtonairport.co.nz/flights/";

export const WLG: AirportInfo = { iata: "WLG", name: "Wellington Airport", city: "Wellington", country: "nz", tz: "Pacific/Auckland", lat: -41.3272, lon: 174.8053 };

export interface WlgFlight {
  place: string;
  scheduled: string;
  estimated?: string;
  carrier_name?: string;
  flight_number: string;
  gate?: string;
  status_text?: string;
}

export function extractFlights(html: string): { day: string; flights: WlgFlight[] } {
  const m = html.match(/<script type="application\/json" data-flights>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Wellington Airport: flight data not found in page");
  const data = JSON.parse(m[1]) as { day: string; flights: WlgFlight[] };
  if (!Array.isArray(data.flights) || !data.day) throw new Error("Wellington Airport: unexpected flight data");
  return data;
}

export function mapWlgStatus(text: string | undefined, arrival: boolean, delay: number | undefined): DepartureState {
  const t = (text ?? "").toLowerCase();
  if (t.includes("cancel")) return "cancelled";
  if (t.includes("departed")) return "departed";
  if (t.includes("landed")) return "landed";
  if (t.includes("arrived")) return "arrived";
  if (t.includes("delay")) return "delayed";
  if (!arrival && (t.includes("gate") || t.includes("boarding") || t.includes("final call"))) return "boarding";
  return delayedOrOn(delay);
}

export function mapWlgFlight(f: WlgFlight, day: string, arrival: boolean): Departure | undefined {
  const scheduledAt = parseLocal(`${day} ${f.scheduled}`, WLG.tz);
  if (!scheduledAt || !f.flight_number) return undefined;
  const estimatedAt = f.estimated ? clockNear(f.estimated, scheduledAt, WLG.tz) : undefined;
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapWlgStatus(f.status_text, arrival, delayMinutes);
  const direction = arrival ? "arrival" : "departure";
  return {
    id: departureId(WLG.iata, direction, f.flight_number, scheduledAt),
    stationId: WLG.iata,
    stationName: WLG.name,
    direction,
    mode: "air",
    service: f.flight_number,
    carrier: f.carrier_name,
    counterpart: f.place,
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    platform: !arrival && f.gate ? f.gate : undefined,
    status,
    statusText: f.status_text || undefined,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

async function board(ctx: ConnectorContext, direction: "D" | "A", date: string): Promise<Departure[]> {
  const { day, flights } = extractFlights(await fetchText(ctx, `${BASE}?direction=${direction}&day=${date}`));
  return flights.map((f) => mapWlgFlight(f, day, direction === "A")).filter((d): d is Departure => !!d);
}

export const wlg: Connector = {
  meta: {
    id: "nz-wellington-wlg-airport",
    name: "Wellington Airport flights",
    operator: "Wellington International Airport",
    country: "nz",
    city: "Wellington",
    region: "oceania",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.wellingtonairport.co.nz/flights/",
    endpoints: [BASE],
    attribution: "Flight information from Wellington Airport",
    intervalMinutes: 5,
    lat: -41.3272,
    lon: 174.8053,
  },
  async fetch(ctx) {
    const dates = windowDates(ctx.now, WLG.tz);
    const boards = await Promise.all(dates.flatMap((d) => [board(ctx, "D", d), board(ctx, "A", d)]));
    const departures = uniqueDepartures(inWindow(boards.flat(), ctx.now));
    return { departures, stations: [airportStatus(WLG, departures, ctx.now)] };
  },
};
