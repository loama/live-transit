import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, clockNear, delayBetween, delayedOrOn, departureId, localDateParts, uniqueDepartures, zonedToUtc, type AirportInfo } from "./fids";

const BASE = "https://www.hongkongairport.com/flightinfo-rest/rest";

export const HKIA: AirportInfo = { iata: "HKG", name: "Hong Kong International Airport", city: "Hong Kong", country: "hk", tz: "Asia/Hong_Kong", lat: 22.308, lon: 113.9185 };

interface HkFlight {
  time: string;
  flight: { no: string; airline: string }[];
  status: string;
  destination?: string[];
  origin?: string[];
  gate?: string;
  stand?: string;
}
interface HkDay {
  date: string;
  arrival: boolean;
  list: HkFlight[];
}
interface Named {
  code: string;
  description: string[];
}

const toDate = (date: string, hhmm: string): Date | undefined => {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = hhmm.match(/^(\d{2}):(\d{2})$/);
  return d && t ? zonedToUtc(+d[1], +d[2], +d[3], +t[1], +t[2], HKIA.tz) : undefined;
};

/** Resolve a status clock time (optionally with dd/mm/yyyy) to the instant nearest the scheduled time. */
function statusTime(hh: string, mm: string, dmy: string | undefined, scheduledAt: Date): Date {
  if (dmy) {
    const [d, m, y] = dmy.split("/").map(Number);
    return zonedToUtc(y, m, d, +hh, +mm, HKIA.tz);
  }
  return clockNear(`${hh}:${mm}`, scheduledAt, HKIA.tz)!;
}

export function mapHkStatus(raw: string, arrival: boolean, scheduledAt: Date): { status: DepartureState; statusText?: string; estimatedAt?: Date } {
  const s = raw.trim();
  if (!s) return { status: "scheduled" };
  const m = s.match(/^(Dep|At gate|Landed|Est at)\s+(\d{2}):(\d{2})(?:\s+\((\d{2}\/\d{2}\/\d{4})\))?$/i);
  if (m) {
    const at = statusTime(m[2], m[3], m[4], scheduledAt);
    const kind = m[1].toLowerCase();
    if (kind === "est at") return { status: delayedOrOn(delayBetween(scheduledAt, at)), statusText: s, estimatedAt: at };
    if (kind === "dep") return { status: "departed", statusText: s, estimatedAt: at };
    if (kind === "landed") return { status: "landed", statusText: s, estimatedAt: at };
    return { status: "arrived", statusText: s, estimatedAt: at };
  }
  const lower = s.toLowerCase();
  if (lower === "cancelled") return { status: "cancelled", statusText: s };
  if (!arrival && /^(boarding|boarding soon|final call|gate closed|gate open)$/.test(lower)) return { status: "boarding", statusText: s };
  return { status: "unknown", statusText: s };
}

export function mapHkDay(day: HkDay, airlines: Map<string, string>, places: Map<string, string>): Departure[] {
  const out: Departure[] = [];
  const direction = day.arrival ? "arrival" : "departure";
  for (const f of day.list) {
    const scheduledAt = toDate(day.date, f.time);
    const op = f.flight[0];
    if (!scheduledAt || !op) continue;
    const { status, statusText, estimatedAt } = mapHkStatus(f.status, day.arrival, scheduledAt);
    const place = (day.arrival ? f.origin : f.destination)?.[0];
    const service = op.no.replace(/\s+/g, "");
    out.push({
      id: departureId(HKIA.iata, direction, service, scheduledAt),
      stationId: HKIA.iata,
      stationName: HKIA.name,
      direction,
      mode: "air",
      service,
      carrier: airlines.get(op.airline) ?? op.airline,
      counterpart: place ? places.get(place) ?? place : undefined,
      scheduledAt,
      estimatedAt,
      platform: (day.arrival ? f.stand : f.gate) || undefined,
      status,
      statusText,
      delayMinutes: status === "cancelled" ? undefined : delayBetween(scheduledAt, estimatedAt),
    });
  }
  return out;
}

const lookup = (list: Named[]) => new Map(list.map((x) => [x.code, x.description[0]]));

export const hkia: Connector = {
  meta: {
    id: "hk-hkia-flights",
    name: "Hong Kong International Airport flights",
    operator: "Airport Authority Hong Kong",
    country: "hk",
    city: "Hong Kong",
    region: "asia",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.hongkongairport.com/en/flights/departures/passenger.page",
    endpoints: [`${BASE}/flights`, `${BASE}/airlines`, `${BASE}/airports`],
    attribution: "Flight information from Hong Kong International Airport",
    intervalMinutes: 5,
    lat: 22.308,
    lon: 113.9185,
  },
  async fetch(ctx) {
    const p = localDateParts(new Date(ctx.now.getTime() - 3 * 3_600_000), HKIA.tz);
    const date = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    const board = (arrival: boolean) => fetchJson<HkDay[]>(ctx, `${BASE}/flights?span=2&date=${date}&lang=en&cargo=false&arrival=${arrival}`);
    const [dep, arr, airlines, airports] = await Promise.all([
      board(false),
      board(true),
      fetchJson<Named[]>(ctx, `${BASE}/airlines?lang=en`),
      fetchJson<Named[]>(ctx, `${BASE}/airports?lang=en`),
    ]);
    const al = lookup(airlines);
    const ap = lookup(airports);
    const from = ctx.now.getTime() - 2 * 3_600_000;
    const to = ctx.now.getTime() + 12 * 3_600_000;
    const departures = uniqueDepartures(
      [...dep, ...arr].flatMap((day) => mapHkDay(day, al, ap)).filter((d) => d.scheduledAt.getTime() >= from && d.scheduledAt.getTime() <= to),
    );
    return { departures, stations: [airportStatus(HKIA, departures, ctx.now)] };
  },
};
