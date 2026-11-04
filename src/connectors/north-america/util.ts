import type { Alert, Connector, LineState, LineStatus, Mode, Vehicle } from "@/lib/types";

export function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Short stable hash for building alert ids from text. */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const RANK: Record<LineState, number> = { good: 0, unknown: 1, minor: 2, major: 3, suspended: 4, closed: 5 };

export function worse(a: LineState, b: LineState): LineState {
  return RANK[b] > RANK[a] ? b : a;
}

/** Line state implied by a GTFS-RT effect, or undefined when the effect does not describe the line's service. */
export function stateFromEffect(effect?: string): LineState | undefined {
  switch (effect) {
    case "NO_SERVICE":
      return "suspended";
    case "REDUCED_SERVICE":
    case "SIGNIFICANT_DELAYS":
      return "major";
    case "DETOUR":
    case "MODIFIED_SERVICE":
    case "STOP_MOVED":
      return "minor";
    default:
      return undefined;
  }
}

export interface LineDef {
  id: string;
  name: string;
  mode: Mode;
  color?: string;
}

/** Build line statuses from alerts: each line takes the worst state implied by the alerts that name it. */
export function linesFromAlerts(defs: LineDef[], alerts: Alert[]): LineStatus[] {
  return defs.map((d) => {
    let state: LineState = "good";
    let text = "Normal service";
    for (const a of alerts) {
      if (!a.routes?.includes(d.id)) continue;
      const s = stateFromEffect(a.effect);
      if (s && s !== "good" && worse(state, s) !== state) {
        state = s;
        text = a.title;
      }
    }
    return { lineId: d.id, lineName: d.name, mode: d.mode, color: d.color, status: state, statusText: text.slice(0, 200) };
  });
}

/** Convert a wall-clock time in an IANA zone to a UTC Date. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string, s = 0): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
}

/** Parse "MM/DD/YYYY HH:mm:ss" or "M/D/YYYY h:mm:ss AM" in a zone. */
export function parseUsDateTime(s: string, tz: string): Date | undefined {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return undefined;
  let h = Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toUpperCase() === "PM" ? 12 : 0);
  return zonedToUtc(Number(m[3]), Number(m[1]), Number(m[2]), h, Number(m[5]), tz, Number(m[6] ?? 0));
}

/** Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm[:ss]" (no offset) in a zone. */
export function parseLocalIso(s: string | null | undefined, tz: string): Date | undefined {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return undefined;
  return zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), tz, Number(m[6] ?? 0));
}

export const asArray = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parse "Oct 29, 2026 10:48:14 AM" in a zone. */
export function parseMonthDateTime(s: string, tz: string): Date | undefined {
  const m = s.match(/([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))? ?(AM|PM)/i);
  if (!m) return undefined;
  const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  if (!mo) return undefined;
  const h = (Number(m[4]) % 12) + (m[7].toUpperCase() === "PM" ? 12 : 0);
  return zonedToUtc(Number(m[3]), mo, Number(m[2]), h, Number(m[5]), tz, Number(m[6] ?? 0));
}

/** Wrap a connector so vehicles are unique by id and positions older than `maxAgeMinutes` are dropped. */
export function cleanVehicles(c: Connector, maxAgeMinutes = 30): Connector {
  return {
    meta: c.meta,
    async fetch(ctx) {
      const r = await c.fetch(ctx);
      if (!r.vehicles) return r;
      const cutoff = ctx.now.getTime() - maxAgeMinutes * 60_000;
      const byId = new Map<string, Vehicle>();
      for (const v of r.vehicles) if (!v.observedAt || v.observedAt.getTime() >= cutoff) byId.set(v.id, v);
      return { ...r, vehicles: [...byId.values()] };
    },
  };
}
