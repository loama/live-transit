import { XMLParser } from "fast-xml-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, Severity, StationState, StationStatus } from "@/lib/types";
import { US_AIRPORTS } from "./us-airports";

const URL = "https://nasstatus.faa.gov/api/airport-status-information";
const PAGE = "https://nasstatus.faa.gov/";

const ARRAYS = new Set(["Delay_type", "Ground_Delay", "Delay", "Program", "Airport", "Arrival_Departure"]);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", isArray: (n) => ARRAYS.has(n), parseTagValue: false });

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TZ_OFFSET_HOURS: Record<string, number> = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, AKST: -9, AKDT: -8, HST: -10, UTC: 0, GMT: 0, Z: 0 };

/** "37 minutes", "1 hour and 11 minutes", "2 hours" to minutes. */
export function parseDurationMinutes(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const h = s.match(/(\d+)\s*hour/);
  const m = s.match(/(\d+)\s*minute/);
  if (!h && !m) return undefined;
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}

/** "Nov 03 at 07:30 UTC." relative to `now`; picks the year that puts the date closest to `ref`. */
export function parseFaaDate(s: string | undefined, now: Date, ref?: Date): Date | undefined {
  const m = s?.match(/([A-Za-z]{3})\w*\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  if (mon < 0) return undefined;
  const anchor = ref ?? now;
  const year = anchor.getUTCFullYear();
  let best: Date | undefined;
  for (const y of [year - 1, year, year + 1]) {
    const d = new Date(Date.UTC(y, mon, +m[2], +m[3], +m[4]));
    if (!best || Math.abs(d.getTime() - anchor.getTime()) < Math.abs(best.getTime() - anchor.getTime())) best = d;
  }
  return best;
}

/** "10:15 pm EDT" as the next occurrence after `now`. */
export function parseEndTime(s: string | undefined, now: Date): Date | undefined {
  const m = s?.match(/(\d{1,2}):(\d{2})\s*([ap]m)\s*([A-Z]{1,4})?/i);
  if (!m) return undefined;
  const offset = TZ_OFFSET_HOURS[(m[4] ?? "UTC").toUpperCase()];
  if (offset === undefined) return undefined;
  let h = +m[1] % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h - offset, +m[2]);
  const candidates = [base - 86_400_000, base, base + 86_400_000];
  return new Date(candidates.find((t) => t >= now.getTime() - 3_600_000) ?? base);
}

/** True when `now` falls in a daily `HHMM-HHMM` UTC window mentioned as "DLY" in a NOTAM. */
function inDailyWindow(reason: string, now: Date): boolean | undefined {
  const m = reason.match(/\bDLY\s+(\d{2})(\d{2})-(\d{2})(\d{2})\b/);
  if (!m) return undefined;
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  const a = +m[1] * 60 + +m[2];
  const b = +m[3] * 60 + +m[4];
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

const PARTIAL_CLOSURE = /\b(GA|TRANSIENT|EXC|PPR|NON SKED|MIL|HELI|RWY|TWY|ACFT)\b/;

interface Raw {
  [k: string]: any;
}

const RANK: Record<StationState, number> = { unknown: 0, normal: 1, delays: 2, major_delays: 3, closed: 4 };

export function parseFaa(xml: string, now: Date): { alerts: Alert[]; stations: StationStatus[] } {
  const root = parser.parse(xml)?.AIRPORT_STATUS_INFORMATION as Raw | undefined;
  if (!root) throw new Error("FAA NAS status: unexpected response, no AIRPORT_STATUS_INFORMATION root");
  const alerts: Alert[] = [];
  const state = new Map<string, { status: StationState; texts: string[]; delay?: number }>();

  const bump = (arpt: string, status: StationState, text: string, delay?: number) => {
    const cur = state.get(arpt) ?? { status: "normal" as StationState, texts: [] };
    cur.texts.push(text);
    if (RANK[status] > RANK[cur.status]) cur.status = status;
    if (delay !== undefined && (cur.delay === undefined || delay > cur.delay)) cur.delay = delay;
    state.set(arpt, cur);
  };
  const alert = (a: Omit<Alert, "modes" | "url"> & { arpt: string }) => {
    const { arpt, ...rest } = a;
    alerts.push({ ...rest, modes: ["air"], url: PAGE, stops: [US_AIRPORTS.get(arpt)?.name ?? arpt] });
  };
  const sev = (min: number | undefined): Severity => (min !== undefined && min >= 60 ? "major" : "minor");

  for (const dt of root.Delay_type ?? []) {
    for (const g of dt.Ground_Delay_List?.Ground_Delay ?? []) {
      const avg = parseDurationMinutes(g.Avg);
      const max = parseDurationMinutes(g.Max);
      const text = `Ground delay program${g.Reason ? ` (${g.Reason})` : ""}: average ${g.Avg ?? "n/a"}, maximum ${g.Max ?? "n/a"}`;
      bump(g.ARPT, (avg ?? 0) >= 60 ? "major_delays" : "delays", text, avg);
      alert({ arpt: g.ARPT, id: `gdp:${g.ARPT}:${g.Reason ?? ""}`, severity: sev(avg), effect: "SIGNIFICANT_DELAYS", cause: g.Reason, title: `${g.ARPT}: ground delay program`, description: text });
    }
    for (const p of dt.Ground_Stop_List?.Program ?? []) {
      const until = parseEndTime(p.End_Time, now);
      const text = `Ground stop${p.Reason ? ` (${p.Reason})` : ""}${p.End_Time ? `, until ${p.End_Time}` : ""}`;
      bump(p.ARPT, "major_delays", text);
      alert({ arpt: p.ARPT, id: `gs:${p.ARPT}:${p.Reason ?? ""}`, severity: "major", effect: "NO_SERVICE", cause: p.Reason, title: `${p.ARPT}: ground stop`, description: text, activeUntil: until });
    }
    for (const d of dt.Arrival_Departure_Delay_List?.Delay ?? []) {
      for (const ad of d.Arrival_Departure ?? []) {
        const type = ad["@Type"] ?? "Arrival/Departure";
        const min = parseDurationMinutes(ad.Min);
        const max = parseDurationMinutes(ad.Max);
        const text = `${type} delays${d.Reason ? ` (${d.Reason})` : ""}: ${ad.Min ?? "n/a"} to ${ad.Max ?? "n/a"}${ad.Trend ? `, ${String(ad.Trend).toLowerCase()}` : ""}`;
        const worst = max ?? min;
        bump(d.ARPT, (worst ?? 0) >= 60 ? "major_delays" : "delays", text, worst);
        alert({ arpt: d.ARPT, id: `delay:${d.ARPT}:${type}:${d.Reason ?? ""}`, severity: sev(worst), effect: "SIGNIFICANT_DELAYS", cause: d.Reason, title: `${d.ARPT}: ${type.toLowerCase()} delays`, description: text });
      }
    }
    for (const c of dt.Airport_Closure_List?.Airport ?? []) {
      const reason = String(c.Reason ?? "");
      const start = parseFaaDate(c.Start, now);
      const end = parseFaaDate(c.Reopen, now, start);
      const endFixed = start && end && end < start ? new Date(end.getTime() + 365 * 86_400_000) : end;
      const daily = inDailyWindow(reason, now);
      const active = (!start || start <= now) && (!endFixed || endFixed > now) && daily !== false;
      const partial = PARTIAL_CLOSURE.test(reason.replace(/\bAP CLSD\b/, ""));
      const text = `Airport closure NOTAM: ${reason}`;
      if (active && !partial) bump(c.ARPT, "closed", text);
      alert({ arpt: c.ARPT, id: `closure:${c.ARPT}:${reason.slice(0, 40)}`, severity: partial ? "info" : "severe", effect: partial ? "MODIFIED_SERVICE" : "NO_SERVICE", title: `${c.ARPT}: ${partial ? "restricted airport access" : "airport closed"}`, description: text, activeFrom: start, activeUntil: endFixed });
    }
  }

  const stations: StationStatus[] = [...state].map(([arpt, s]) => {
    const info = US_AIRPORTS.get(arpt);
    return {
      stationId: arpt,
      name: info?.name ?? arpt,
      mode: "air",
      city: info?.city,
      country: "us",
      lat: info?.lat,
      lon: info?.lon,
      status: s.status,
      statusText: s.texts.join("; "),
      delayMinutes: s.delay,
    };
  });
  return { alerts, stations };
}

export const faaNas: Connector = {
  meta: {
    id: "us-faa-nas-status",
    name: "FAA National Airspace System Status",
    operator: "Federal Aviation Administration",
    country: "us",
    region: "north-america",
    modes: ["air"],
    kind: "api",
    homepage: PAGE,
    endpoints: [URL],
    license: "US Government public data",
    attribution: "FAA Air Traffic Control System Command Center",
    intervalMinutes: 5,
    lat: 39.5,
    lon: -98.35,
  },
  async fetch(ctx) {
    return parseFaa(await fetchText(ctx, URL), ctx.now);
  },
};
