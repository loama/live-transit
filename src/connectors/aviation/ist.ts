import { fetchJson } from "@/lib/http";
import type { Connector, ConnectorContext, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, parseLocal, titleCase, uniqueDepartures, type AirportInfo } from "./fids";

const URL = "https://www.istairport.com/umbraco/api/FlightInfo/GetFlightStatusBoard";
const PAGES = 5;

export const IST: AirportInfo = { iata: "IST", name: "Istanbul Airport", city: "Istanbul", country: "tr", tz: "Europe/Istanbul", lat: 41.2753, lon: 28.7519 };

export interface IstFlight {
  flightNumber: string;
  airlineName?: string;
  fromCityName?: string;
  toCityName?: string;
  scheduledDatetime: string;
  estimatedDatetime?: string | null;
  gate?: string;
  remark?: string | null;
}

export function mapIstStatus(remark: string | null | undefined, arrival: boolean, delay: number | undefined): DepartureState {
  const r = (remark ?? "").toLowerCase();
  if (r.includes("cancel")) return "cancelled";
  if (r.includes("divert")) return "diverted";
  if (r.includes("landed")) return "landed";
  if (r.includes("delay")) return "delayed";
  if (!arrival && (r.includes("gate") || r.includes("boarding") || r.includes("last call"))) return "boarding";
  if (!arrival && r.includes("departed")) return "departed";
  if (!r || r.includes("on time") || r.includes("early") || r.includes("expected")) return delayedOrOn(delay);
  return "unknown";
}

export function mapIstFlight(f: IstFlight, arrival: boolean): Departure | undefined {
  const scheduledAt = parseLocal(f.scheduledDatetime, IST.tz);
  if (!scheduledAt || !f.flightNumber) return undefined;
  const estimatedAt = parseLocal(f.estimatedDatetime, IST.tz);
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapIstStatus(f.remark, arrival, delayMinutes);
  const direction = arrival ? "arrival" : "departure";
  return {
    id: departureId(IST.iata, direction, f.flightNumber, scheduledAt),
    stationId: IST.iata,
    stationName: IST.name,
    direction,
    mode: "air",
    service: f.flightNumber,
    carrier: f.airlineName,
    counterpart: titleCase(arrival ? f.fromCityName : f.toCityName),
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    platform: !arrival && f.gate ? f.gate : undefined,
    status,
    statusText: f.remark || undefined,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

interface Board {
  result?: { data?: { flights?: IstFlight[] } };
}

/** Pages are 50 flights each; the next page starts at the last scheduled time of the previous one. */
async function board(ctx: ConnectorContext, arrival: boolean): Promise<Departure[]> {
  const out: Departure[] = [];
  let start = "";
  for (let i = 0; i < PAGES; i++) {
    const body = new URLSearchParams({ nature: arrival ? "0" : "1", searchTerm: "changeflight", pageNumber: "1", pageSize: "50", isInternational: "-1", isCurrentTime: start ? "false" : "true", date: start, endDate: "", culture: "en" });
    const res = await fetchJson<Board>(ctx, URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "https://www.istairport.com/" },
      body,
    });
    const flights = res.result?.data?.flights;
    if (!flights) throw new Error("Istanbul Airport board: unexpected response");
    out.push(...flights.map((f) => mapIstFlight(f, arrival)).filter((d): d is Departure => !!d));
    const last = flights.at(-1)?.scheduledDatetime;
    if (flights.length < 50 || !last) break;
    start = last === start ? new Date(Date.parse(`${last}Z`) + 60_000).toISOString().slice(0, 19) : last;
  }
  return out;
}

export const ist: Connector = {
  meta: {
    id: "tr-istanbul-ist-airport",
    name: "Istanbul Airport flights",
    operator: "IGA Istanbul Airport",
    country: "tr",
    city: "Istanbul",
    region: "middle-east",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.istairport.com/en/flights/departure-flights",
    endpoints: [URL],
    attribution: "Flight information from IGA Istanbul Airport",
    intervalMinutes: 5,
    lat: 41.2753,
    lon: 28.7519,
  },
  async fetch(ctx) {
    const [dep, arr] = await Promise.all([board(ctx, false), board(ctx, true)]);
    const departures = uniqueDepartures([...dep, ...arr]);
    return { departures, stations: [airportStatus(IST, departures, ctx.now)] };
  },
};
