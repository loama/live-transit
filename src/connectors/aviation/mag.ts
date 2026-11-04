import { fetchJson } from "@/lib/http";
import type { Connector, ConnectorContext, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, titleCase, uniqueDepartures, type AirportInfo } from "./fids";

const URL = "https://d3ebfrkw2baepa.cloudfront.net";

export const MAG_AIRPORTS: AirportInfo[] = [
  { iata: "MAN", name: "Manchester Airport", city: "Manchester", country: "gb", tz: "Europe/London", lat: 53.3537, lon: -2.275 },
  { iata: "STN", name: "London Stansted Airport", city: "London", country: "gb", tz: "Europe/London", lat: 51.886, lon: 0.2389 },
  { iata: "EMA", name: "East Midlands Airport", city: "Nottingham", country: "gb", tz: "Europe/London", lat: 52.8311, lon: -1.3281 },
];

export interface MagFlight {
  flightNumber: string;
  airline?: { name?: string; code?: string };
  status?: string;
  scheduledDepartureDateTime?: string;
  estimatedDepartureDateTime?: string | null;
  actualDepartureDateTime?: string | null;
  scheduledArrivalDateTime?: string;
  estimatedArrivalDateTime?: string | null;
  actualArrivalDateTime?: string | null;
  arrivalAirport?: { code?: string; cityName?: string };
  departureAirport?: { code?: string; cityName?: string };
  departureGate?: { number?: string } | null;
}

const FIELDS = (dir: "Departure" | "Arrival") => `id flightNumber airline{name code} status
  scheduled${dir}DateTime estimated${dir}DateTime actual${dir}DateTime
  ${dir === "Departure" ? "arrivalAirport{code cityName} departureGate{number}" : "departureAirport{code cityName}"}`;

const query = (dir: "Departure" | "Arrival") =>
  `query($airportCode:String!,$startDate:AWSDateTime!,$endDate:AWSDateTime!,$size:Int,$from:Int){all${dir}s(tenant:$airportCode,startDate:$startDate,endDate:$endDate,size:$size,from:$from){${FIELDS(dir)}}}`;

export function mapMagStatus(text: string | undefined, arrival: boolean, delay: number | undefined, hasActual: boolean): DepartureState {
  const t = (text ?? "").toLowerCase();
  if (t.startsWith("cancel")) return "cancelled";
  if (t.startsWith("divert")) return "diverted";
  if (t.startsWith("departed")) return "departed";
  if (t.startsWith("arrived")) return "arrived";
  if (t.startsWith("landed")) return "landed";
  if (!arrival && (t.startsWith("go to gate") || t.startsWith("final call") || t.startsWith("boarding"))) return "boarding";
  if (hasActual) return arrival ? "arrived" : "departed";
  return delayedOrOn(delay);
}

export function mapMagFlight(info: AirportInfo, f: MagFlight, arrival: boolean): Departure | undefined {
  const sched = arrival ? f.scheduledArrivalDateTime : f.scheduledDepartureDateTime;
  if (!sched || !f.flightNumber) return undefined;
  const scheduledAt = new Date(sched);
  if (Number.isNaN(scheduledAt.getTime())) return undefined;
  const actual = arrival ? f.actualArrivalDateTime : f.actualDepartureDateTime;
  const estimated = arrival ? f.estimatedArrivalDateTime : f.estimatedDepartureDateTime;
  const at = actual ?? estimated;
  const estimatedAt = at ? new Date(at) : undefined;
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapMagStatus(f.status, arrival, delayMinutes, !!actual);
  const direction = arrival ? "arrival" : "departure";
  const other = arrival ? f.departureAirport : f.arrivalAirport;
  return {
    id: departureId(info.iata, direction, f.flightNumber, scheduledAt),
    stationId: info.iata,
    stationName: info.name,
    direction,
    mode: "air",
    service: f.flightNumber,
    carrier: titleCase(f.airline?.name),
    counterpart: titleCase(other?.cityName) ?? other?.code,
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    platform: !arrival ? f.departureGate?.number || undefined : undefined,
    status,
    statusText: f.status || undefined,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

async function board(ctx: ConnectorContext, info: AirportInfo, dir: "Departure" | "Arrival"): Promise<Departure[]> {
  const hour = (ms: number) => new Date(Math.floor(ms / 3_600_000) * 3_600_000).toISOString().replace(".000", "");
  const res = await fetchJson<{ data?: Record<string, MagFlight[]>; errors?: { message: string }[] }>(ctx, URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: query(dir),
      variables: { airportCode: info.iata, startDate: hour(ctx.now.getTime() - 2 * 3_600_000), endDate: hour(ctx.now.getTime() + 12 * 3_600_000), size: 400, from: 0 },
    }),
  });
  if (res.errors?.length) throw new Error(`MAG ${info.iata} ${dir}: ${res.errors[0].message}`);
  const list = res.data?.[`all${dir}s`];
  if (!list) throw new Error(`MAG ${info.iata} ${dir}: empty response`);
  return list.map((f) => mapMagFlight(info, f, dir === "Arrival")).filter((d): d is Departure => !!d);
}

export const mag: Connector = {
  meta: {
    id: "gb-mag-airports",
    name: "Manchester Airports Group (Manchester, Stansted, East Midlands)",
    operator: "Manchester Airports Group",
    country: "gb",
    region: "europe",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.manchesterairport.co.uk/flight-information/departures/",
    endpoints: [URL],
    attribution: "Flight information from Manchester Airports Group",
    intervalMinutes: 5,
    lat: 53.0,
    lon: -1.0,
  },
  async fetch(ctx) {
    const boards = await Promise.all(MAG_AIRPORTS.flatMap((a) => [board(ctx, a, "Departure"), board(ctx, a, "Arrival")]));
    const departures = uniqueDepartures(boards.flat());
    return { departures, stations: MAG_AIRPORTS.map((a) => airportStatus(a, departures, ctx.now)) };
  },
};
