import { XMLParser } from "fast-xml-parser";
import { fetchBuffer } from "@/lib/http";
import type { Connector, ConnectorContext, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, uniqueDepartures, type AirportInfo } from "./fids";

const BASE = "https://asrv.avinor.no";

export const AVINOR_AIRPORTS: AirportInfo[] = [
  { iata: "OSL", name: "Oslo Airport", city: "Oslo", country: "no", tz: "Europe/Oslo", lat: 60.1939, lon: 11.1004 },
  { iata: "BGO", name: "Bergen Airport Flesland", city: "Bergen", country: "no", tz: "Europe/Oslo", lat: 60.2934, lon: 5.2181 },
  { iata: "TRD", name: "Trondheim Airport Værnes", city: "Trondheim", country: "no", tz: "Europe/Oslo", lat: 63.4578, lon: 10.924 },
  { iata: "SVG", name: "Stavanger Airport Sola", city: "Stavanger", country: "no", tz: "Europe/Oslo", lat: 58.8767, lon: 5.6378 },
  { iata: "BOO", name: "Bodø Airport", city: "Bodø", country: "no", tz: "Europe/Oslo", lat: 67.2692, lon: 14.3653 },
  { iata: "TOS", name: "Tromsø Airport", city: "Tromsø", country: "no", tz: "Europe/Oslo", lat: 69.6833, lon: 18.9189 },
  { iata: "AES", name: "Ålesund Airport Vigra", city: "Ålesund", country: "no", tz: "Europe/Oslo", lat: 62.56, lon: 6.11 },
  { iata: "KRS", name: "Kristiansand Airport Kjevik", city: "Kristiansand", country: "no", tz: "Europe/Oslo", lat: 58.2042, lon: 8.0853 },
  { iata: "HAU", name: "Haugesund Airport Karmøy", city: "Haugesund", country: "no", tz: "Europe/Oslo", lat: 59.3453, lon: 5.2084 },
  { iata: "MOL", name: "Molde Airport Årø", city: "Molde", country: "no", tz: "Europe/Oslo", lat: 62.7447, lon: 7.2625 },
];

interface AvinorFlight {
  flight_id?: string;
  airline?: string;
  schedule_time?: string;
  arr_dep?: "A" | "D";
  airport?: string;
  gate?: string;
  status?: { code?: string; time?: string };
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: (n) => n === "flight" || n === "airlineName" || n === "airportName" });

async function xml(ctx: ConnectorContext, url: string): Promise<any> {
  const buf = await fetchBuffer(ctx, url);
  return parser.parse(new TextDecoder("iso-8859-1").decode(buf));
}

function names(doc: any, list: "airlineNames" | "airportNames", key: "airlineName" | "airportName"): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of doc?.[list]?.[key] ?? []) m.set(String(x.code), String(x.name));
  return m;
}

export function mapAvinorFlight(info: AirportInfo, f: AvinorFlight, airlines: Map<string, string>, places: Map<string, string>): Departure | undefined {
  if (!f.flight_id || !f.schedule_time || !f.arr_dep) return undefined;
  const scheduledAt = new Date(f.schedule_time);
  if (Number.isNaN(scheduledAt.getTime())) return undefined;
  const direction = f.arr_dep === "D" ? "departure" : "arrival";
  const code = f.status?.code;
  const at = f.status?.time ? new Date(f.status.time) : undefined;
  const estimatedAt = at && !Number.isNaN(at.getTime()) ? at : undefined;
  const delayMinutes = code === "C" ? undefined : delayBetween(scheduledAt, estimatedAt);
  let status: DepartureState = "scheduled";
  let statusText: string | undefined;
  if (code === "C") [status, statusText] = ["cancelled", "Cancelled"];
  else if (code === "D") [status, statusText] = ["departed", "Departed"];
  else if (code === "A") [status, statusText] = ["arrived", "Arrived"];
  else if (code === "E") [status, statusText] = [delayedOrOn(delayMinutes), "New time"];
  return {
    id: departureId(info.iata, direction, f.flight_id, scheduledAt),
    stationId: info.iata,
    stationName: info.name,
    direction,
    mode: "air",
    service: f.flight_id,
    carrier: f.airline ? airlines.get(f.airline) ?? f.airline : undefined,
    counterpart: f.airport ? places.get(f.airport) ?? f.airport : undefined,
    scheduledAt,
    estimatedAt: code === "C" ? undefined : estimatedAt,
    platform: f.gate ? String(f.gate) : undefined,
    status,
    statusText,
    delayMinutes,
  };
}

export const avinor: Connector = {
  meta: {
    id: "no-avinor-airports",
    name: "Avinor airports (Oslo, Bergen, Trondheim, Stavanger and more)",
    operator: "Avinor",
    country: "no",
    region: "europe",
    modes: ["air"],
    kind: "fids",
    homepage: "https://avinor.no/en/airport/oslo-airport/flights/",
    endpoints: [`${BASE}/XmlFeed/v1.0`, `${BASE}/airportNames/v1.0`, `${BASE}/airlineNames/v1.0`],
    license: "Avinor open flight data",
    attribution: "Flight data from Avinor (flydata.avinor.no)",
    intervalMinutes: 5,
    lat: 61.0,
    lon: 9.0,
  },
  async fetch(ctx) {
    const [airlineDoc, airportDoc] = await Promise.all([xml(ctx, `${BASE}/airlineNames/v1.0`), xml(ctx, `${BASE}/airportNames/v1.0`)]);
    const airlines = names(airlineDoc, "airlineNames", "airlineName");
    const places = names(airportDoc, "airportNames", "airportName");
    const boards = await Promise.all(
      AVINOR_AIRPORTS.map(async (info) => {
        const doc = await xml(ctx, `${BASE}/XmlFeed/v1.0?airport=${info.iata}&TimeFrom=2&TimeTo=12&codeshare=Y`);
        const flights: AvinorFlight[] = doc?.airport?.flights?.flight ?? [];
        return flights.map((f) => mapAvinorFlight(info, f, airlines, places)).filter((d): d is Departure => !!d);
      }),
    );
    const departures = uniqueDepartures(boards.flat());
    return { departures, stations: AVINOR_AIRPORTS.map((a) => airportStatus(a, departures, ctx.now)) };
  },
};
