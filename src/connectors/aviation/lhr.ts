import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, clockNear, delayBetween, delayedOrOn, departureId, localDateParts, uniqueDepartures, type AirportInfo } from "./fids";

const BASE = "https://api-dp-prod.dp.heathrow.com/pihub/flights";

export const LHR: AirportInfo = { iata: "LHR", name: "Heathrow Airport", city: "London", country: "gb", tz: "Europe/London", lat: 51.47, lon: -0.4543 };

interface Port {
  portOfCallType: "ORIGIN" | "DESTINATION";
  airportFacility: { iataIdentifier: string; airportCityLocation?: { name?: string }; terminalFacility?: { gateFacility?: { gateNumber?: string } } };
  operatingTimes?: { scheduled?: { utc?: string } };
}
export interface LhrFlight {
  flightService: {
    iataFlightIdentifier: string;
    aircraftMovement: { aircraftMovementStatus?: { message: string; statusCode: string }[]; route: { portsOfCall: Port[] } };
    airlineParty?: { name?: string };
  };
}

export function mapLhrStatus(code: string | undefined, message: string | undefined, delay: number | undefined): DepartureState {
  switch (code) {
    case "CX":
      return "cancelled";
    case "AB":
    case "TX":
      return "departed";
    case "GO":
    case "BD":
    case "LC":
    case "GC":
      return "boarding";
    case "LD":
    case "FB":
      return "landed";
    case "LB":
      return "arrived";
    case "NI":
      return "delayed";
    case "EX":
    case "SH":
    case "ES":
    case "ZN":
    case "FS":
      return /^delayed/i.test(message ?? "") ? "delayed" : delayedOrOn(delay);
    default:
      return "unknown";
  }
}

export function mapLhrFlight(f: LhrFlight, arrival: boolean): Departure | undefined {
  const s = f.flightService;
  const ports = s.aircraftMovement.route.portsOfCall;
  const here = ports.find((p) => p.portOfCallType === (arrival ? "DESTINATION" : "ORIGIN"));
  const other = ports.find((p) => p.portOfCallType === (arrival ? "ORIGIN" : "DESTINATION"));
  const utc = here?.operatingTimes?.scheduled?.utc;
  if (!utc || !s.iataFlightIdentifier) return undefined;
  const scheduledAt = new Date(`${utc}Z`);
  const st = s.aircraftMovement.aircraftMovementStatus?.[0];
  const clock = st?.message.match(/(?:On time|Delayed|Expected|Departed|Taxied|Landed) (\d{2}:\d{2})/);
  const estimatedAt = clock ? clockNear(clock[1], scheduledAt, LHR.tz) : undefined;
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapLhrStatus(st?.statusCode, st?.message, delayMinutes);
  const direction = arrival ? "arrival" : "departure";
  return {
    id: departureId(LHR.iata, direction, s.iataFlightIdentifier, scheduledAt),
    stationId: LHR.iata,
    stationName: LHR.name,
    direction,
    mode: "air",
    service: s.iataFlightIdentifier,
    carrier: s.airlineParty?.name,
    counterpart: other?.airportFacility.airportCityLocation?.name ?? other?.airportFacility.iataIdentifier,
    scheduledAt,
    estimatedAt,
    platform: !arrival ? here?.airportFacility.terminalFacility?.gateFacility?.gateNumber : undefined,
    status,
    statusText: st?.message,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

export const lhr: Connector = {
  meta: {
    id: "gb-london-heathrow",
    name: "Heathrow Airport flights",
    operator: "Heathrow Airport Limited",
    country: "gb",
    city: "London",
    region: "europe",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.heathrow.com/departures",
    endpoints: [`${BASE}/departures`, `${BASE}/arrivals`],
    attribution: "Flight information from Heathrow Airport",
    intervalMinutes: 5,
    lat: 51.47,
    lon: -0.4543,
  },
  async fetch(ctx) {
    const day = (at: Date) => {
      const p = localDateParts(at, LHR.tz);
      return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    };
    const dates = [...new Set([day(new Date(ctx.now.getTime() - 2 * 3_600_000)), day(new Date(ctx.now.getTime() + 12 * 3_600_000))])];
    const get = (kind: "departures" | "arrivals", date: string) =>
      fetchJson<LhrFlight[]>(ctx, `${BASE}/${kind}?date=${date}&excludeCodeShares=true`, { headers: { Origin: "https://www.heathrow.com" } });
    const [dep, arr] = await Promise.all([
      Promise.all(dates.map((d) => get("departures", d))),
      Promise.all(dates.map((d) => get("arrivals", d))),
    ]);
    const from = ctx.now.getTime() - 2 * 3_600_000;
    const to = ctx.now.getTime() + 12 * 3_600_000;
    const rows = [...dep.flat().map((f) => mapLhrFlight(f, false)), ...arr.flat().map((f) => mapLhrFlight(f, true))].filter(
      (d): d is Departure => !!d && d.scheduledAt.getTime() >= from && d.scheduledAt.getTime() <= to,
    );
    const departures = uniqueDepartures(rows);
    return { departures, stations: [airportStatus(LHR, departures, ctx.now)] };
  },
};
