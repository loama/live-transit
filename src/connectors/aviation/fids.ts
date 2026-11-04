import type { Departure, DepartureState, StationState, StationStatus } from "@/lib/types";

export interface AirportInfo {
  iata: string;
  name: string;
  city: string;
  country: string;
  tz: string;
  lat: number;
  lon: number;
}

export const MAX_DEPARTURES = 3000;
const DELAYED_AFTER_MINUTES = 15;

export function flightKey(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

export function departureId(iata: string, direction: Departure["direction"], flight: string, scheduledAt: Date): string {
  return `${iata}:${direction}:${flightKey(flight)}:${scheduledAt.toISOString()}`;
}

/** Whole minutes from scheduled to estimated, or undefined when either is missing. */
export function delayBetween(scheduledAt: Date, estimatedAt?: Date): number | undefined {
  if (!estimatedAt) return undefined;
  return Math.round((estimatedAt.getTime() - scheduledAt.getTime()) / 60_000);
}

function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const v: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") v[p.type] = Number(p.value);
  const asUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** Convert wall-clock components in an IANA timezone to a UTC Date. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - tzOffsetMinutes(tz, new Date(guess)) * 60_000;
  const second = guess - tzOffsetMinutes(tz, new Date(first)) * 60_000;
  return new Date(second);
}

/** Parse `YYYY-MM-DD HH:mm` or `YYYY-MM-DDTHH:mm[:ss]` (no offset) as local time in `tz`. */
export function parseLocal(s: string | undefined | null, tz: string): Date | undefined {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return undefined;
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
}

/** Calendar date parts of `at` in `tz`. */
export function localDateParts(at: Date, tz: string): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const [y, m, d] = p.split("-").map(Number);
  return { y, m, d };
}

export function delayedOrOn(delay: number | undefined, base: DepartureState = "scheduled"): DepartureState {
  if (delay === undefined) return base;
  return delay >= DELAYED_AFTER_MINUTES ? "delayed" : base === "scheduled" ? "on_time" : base;
}

/** Keep the first departure per id and cap the list. */
export function uniqueDepartures(list: Departure[]): Departure[] {
  const seen = new Map<string, Departure>();
  for (const d of list) if (!seen.has(d.id)) seen.set(d.id, d);
  return [...seen.values()].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).slice(0, MAX_DEPARTURES);
}

/**
 * Derive an airport status from its board: flights scheduled within 2h before to 4h after `now`
 * count; the airport is "delays" when a quarter of them are delayed or cancelled and "major_delays" at half.
 */
export function airportStatus(info: AirportInfo, departures: Departure[], now: Date): StationStatus {
  const from = now.getTime() - 2 * 3_600_000;
  const to = now.getTime() + 4 * 3_600_000;
  const window = departures.filter((d) => d.stationId === info.iata && d.scheduledAt.getTime() >= from && d.scheduledAt.getTime() <= to);
  const cancelled = window.filter((d) => d.status === "cancelled").length;
  const live = window.filter((d) => d.status !== "cancelled");
  const delayed = live.filter((d) => (d.delayMinutes ?? 0) >= DELAYED_AFTER_MINUTES).length;
  const known = live.filter((d) => d.delayMinutes !== undefined && d.delayMinutes > 0);
  const avg = known.length ? Math.round(known.reduce((s, d) => s + (d.delayMinutes ?? 0), 0) / known.length) : undefined;
  const bad = delayed + cancelled;
  let status: StationState = "unknown";
  if (window.length >= 8) {
    const share = bad / window.length;
    status = share >= 0.5 ? "major_delays" : share >= 0.25 ? "delays" : "normal";
  }
  return {
    stationId: info.iata,
    name: info.name,
    mode: "air",
    city: info.city,
    country: info.country,
    lat: info.lat,
    lon: info.lon,
    status,
    statusText: window.length
      ? `${delayed} delayed and ${cancelled} cancelled of ${window.length} flights (-2h to +4h)`
      : "No flights on the board in the window",
    delayMinutes: avg,
  };
}

/** "TENERIFE" to "Tenerife", "LONDON (LHR)" to "London (LHR)". Mixed-case input is returned unchanged. */
export function titleCase(s: string | undefined | null): string | undefined {
  if (!s) return undefined;
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/(])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/\(([A-Za-z]{3})\)/g, (_, c: string) => `(${c.toUpperCase()})`);
}

/** Resolve a wall-clock `HH:mm` in `tz` to the instant nearest `near`. */
export function clockNear(hhmm: string, near: Date, tz: string): Date | undefined {
  const m = hhmm.match(/(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const p = localDateParts(near, tz);
  const base = zonedToUtc(p.y, p.m, p.d, +m[1], +m[2], tz).getTime();
  return new Date([base - 86_400_000, base, base + 86_400_000].reduce((a, b) => (Math.abs(b - near.getTime()) < Math.abs(a - near.getTime()) ? b : a)));
}

/** `YYYY-MM-DD` of `at` in `tz`. */
export function localDate(at: Date, tz: string): string {
  const p = localDateParts(at, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Distinct local dates touched by the window from 2h before to 12h after `now`. */
export function windowDates(now: Date, tz: string): string[] {
  return [...new Set([localDate(new Date(now.getTime() - 2 * 3_600_000), tz), localDate(new Date(now.getTime() + 12 * 3_600_000), tz)])];
}

/** Keep departures scheduled from 2h before to 12h after `now`. */
export function inWindow(list: Departure[], now: Date): Departure[] {
  const from = now.getTime() - 2 * 3_600_000;
  const to = now.getTime() + 12 * 3_600_000;
  return list.filter((d) => d.scheduledAt.getTime() >= from && d.scheduledAt.getTime() <= to);
}
