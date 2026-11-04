import { fetchJson } from "@/lib/http";
import type { Connector, ConnectorContext, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, inWindow, parseLocal, uniqueDepartures, windowDates, type AirportInfo } from "./fids";

const URL = "https://www.taoyuan-airport.com/api/api/flight/a_flight";

export const TPE: AirportInfo = { iata: "TPE", name: "Taiwan Taoyuan International Airport", city: "Taipei", country: "tw", tz: "Asia/Taipei", lat: 25.0777, lon: 121.2328 };

export interface TpeFlight {
  AState: "A" | "D";
  AName?: string;
  flightCode: string;
  Gate?: string;
  ODate: string;
  OTime: string;
  RDate?: string;
  RTime?: string;
  CityEname?: string;
  CityCode?: string;
  Memo?: string;
  CurrentStatusEng?: string;
}

const clock = (date: string | undefined, time: string | undefined) => (date && time ? parseLocal(`${date.replaceAll("/", "-")} ${time}`, TPE.tz) : undefined);

export function mapTpeStatus(memo: string, current: string, arrival: boolean, delay: number | undefined): DepartureState {
  const m = memo.toLowerCase();
  const c = current.toLowerCase();
  if (m === "cancelled") return "cancelled";
  if (m === "departed") return "departed";
  if (m === "arrived") return "arrived";
  if (!arrival && (c === "boarding" || c === "final call" || c === "to gate" || c === "closed")) return "boarding";
  return delayedOrOn(delay);
}

export function mapTpeFlight(f: TpeFlight): Departure | undefined {
  const scheduledAt = clock(f.ODate, f.OTime);
  if (!scheduledAt || !f.flightCode) return undefined;
  const arrival = f.AState === "A";
  const direction = arrival ? "arrival" : "departure";
  const memo = (f.Memo ?? "").trim();
  const current = (f.CurrentStatusEng ?? "").trim();
  const estimatedAt = clock(f.RDate, f.RTime);
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapTpeStatus(memo, current, arrival, delayMinutes);
  return {
    id: departureId(TPE.iata, direction, f.flightCode, scheduledAt),
    stationId: TPE.iata,
    stationName: TPE.name,
    direction,
    mode: "air",
    service: f.flightCode,
    carrier: f.AName,
    counterpart: f.CityEname || f.CityCode,
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    platform: !arrival && f.Gate ? f.Gate : undefined,
    status,
    statusText: [memo, current].filter(Boolean).join(", ") || undefined,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

async function board(ctx: ConnectorContext, state: "A" | "D", date: string): Promise<Departure[]> {
  const rows = await fetchJson<TpeFlight[]>(ctx, URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ODate: date.replaceAll("-", "/"), AState: state, language: "en" }),
  });
  if (!Array.isArray(rows)) throw new Error("Taoyuan Airport: unexpected response");
  return rows.map(mapTpeFlight).filter((d): d is Departure => !!d);
}

export const tpe: Connector = {
  meta: {
    id: "tw-taipei-tpe-airport",
    name: "Taiwan Taoyuan International Airport flights",
    operator: "Taoyuan International Airport Corporation",
    country: "tw",
    city: "Taipei",
    region: "asia",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.taoyuan-airport.com/flight_depart?lang=en",
    endpoints: [URL],
    attribution: "Flight information from Taoyuan International Airport",
    intervalMinutes: 5,
    lat: 25.0777,
    lon: 121.2328,
  },
  async fetch(ctx) {
    const dates = windowDates(ctx.now, TPE.tz);
    const boards = await Promise.all(dates.flatMap((d) => [board(ctx, "D", d), board(ctx, "A", d)]));
    const departures = uniqueDepartures(inWindow(boards.flat(), ctx.now));
    return { departures, stations: [airportStatus(TPE, departures, ctx.now)] };
  },
};
