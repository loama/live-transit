import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus, Mode, Severity, Vehicle } from "@/lib/types";
import { worse } from "./util";

const URL = "https://alerts.ttc.ca/api/alerts/list";
const VEHICLES = "https://webservices.umoiq.com/service/publicJSONFeed?command=vehicleLocations&a=ttc&t=0";
const STREETCARS = new Set(["301", "304", "306", "310", "501", "503", "504", "505", "506", "507", "508", "509", "510", "511", "512"]);

interface TtcVehicle {
  id: string;
  routeTag: string;
  lat: string;
  lon: string;
  heading: string;
  speedKmHr: string;
  secsSinceReport: string;
  dirTag?: string;
}

export function ttcVehicles(list: TtcVehicle[], now: Date): Vehicle[] {
  return list
    .filter((v) => Number(v.lat) && Number(v.lon))
    .map((v) => ({
      id: v.id,
      mode: STREETCARS.has(v.routeTag) ? "tram" : "bus",
      routeId: v.routeTag,
      routeName: v.routeTag,
      lat: Number(v.lat),
      lon: Number(v.lon),
      bearing: Number(v.heading) >= 0 ? Number(v.heading) : undefined,
      speed: (Number(v.speedKmHr) || 0) / 3.6,
      label: v.id,
      observedAt: new Date(now.getTime() - (Number(v.secsSinceReport) || 0) * 1000),
    }));
}

interface TtcAlert {
  id: string;
  alertType: string;
  activePeriod?: { start?: string; end?: string };
  activePeriodGroup?: string[];
  route: string;
  routeType: string;
  effect: string;
  effectDesc?: string;
  severity: string;
  headerText: string;
  description?: string;
  cause?: string;
  causeDescription?: string;
  url?: string;
}
interface TtcResponse {
  routes: TtcAlert[];
  accessibility: TtcAlert[];
}

const SUBWAY_NAMES: Record<string, string> = {
  "1": "Line 1 Yonge-University",
  "2": "Line 2 Bloor-Danforth",
  "4": "Line 4 Sheppard",
};
const SUBWAY_COLORS: Record<string, string> = { "1": "FFC524", "2": "00A651", "4": "A21A68" };

export function ttcState(effect: string, severity: string): LineState {
  if (effect === "NO_SERVICE") return "suspended";
  if (effect === "NO_EFFECT") return "good";
  if (severity === "Critical" || severity === "Major") return "major";
  return "minor";
}

const MODE: Record<string, Mode> = { Subway: "metro", Streetcar: "tram", Bus: "bus" };

const real = (iso?: string) => (iso && !iso.startsWith("0001") ? new Date(iso) : undefined);

/** True for "starting 11:59 p.m., nightly ..." closures during the part of the day before they begin (service runs normally until then). */
export function nightlyClosureNotYetInForce(text: string, now: Date): boolean {
  const m = /starting (\d{1,2}):(\d{2}) ([ap])\.m\.,? nightly/i.exec(text);
  if (!m) return false;
  const start = (Number(m[1]) % 12) * 60 + Number(m[2]) + (m[3]!.toLowerCase() === "p" ? 720 : 0);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const at = Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  return at >= 300 && at < start;
}

export function parseTtc(data: TtcResponse, now = new Date()): { alerts: Alert[]; lines: LineStatus[] } {
  const alerts: Alert[] = [];
  const state: Record<string, { s: LineState; text: string }> = {};
  for (const a of [...data.routes, ...data.accessibility]) {
    if (a.activePeriodGroup && !a.activePeriodGroup.includes("Current")) continue;
    const isRoute = data.routes.includes(a);
    const mode = isRoute ? (MODE[a.routeType] ?? "bus") : "metro";
    const pending = isRoute && nightlyClosureNotYetInForce(a.headerText, now);
    const st = isRoute ? ttcState(a.effect, a.severity) : "good";
    const severity: Severity = pending
      ? "minor"
      : st === "suspended" ? "severe" : st === "major" ? "major" : st === "minor" ? "minor" : "info";
    const routeIds = isRoute ? a.route.split(",").map((r) => r.trim()).filter(Boolean) : [];
    alerts.push({
      id: a.id,
      severity,
      effect: a.effect,
      cause: a.cause,
      title: a.headerText,
      description: a.description || a.effectDesc || a.causeDescription,
      url: a.url || undefined,
      modes: [mode],
      routes: routeIds,
      activeFrom: real(a.activePeriod?.start),
      activeUntil: real(a.activePeriod?.end),
    });
    if (isRoute && mode === "metro" && st !== "good" && !pending)
      for (const r of routeIds) {
        const prev = state[r]?.s ?? "good";
        if (worse(prev, st) !== prev) state[r] = { s: st, text: a.headerText };
      }
  }
  const ids = new Set([...Object.keys(SUBWAY_NAMES), ...Object.keys(state)]);
  const lines: LineStatus[] = [...ids].map((id) => ({
    lineId: id,
    lineName: SUBWAY_NAMES[id] ?? `Line ${id}`,
    mode: "metro",
    color: SUBWAY_COLORS[id],
    status: state[id]?.s ?? "good",
    statusText: state[id]?.text.slice(0, 200) ?? "Good service",
  }));
  return { alerts, lines };
}

export const ttc: Connector = {
  meta: {
    id: "ca-toronto-ttc",
    name: "Toronto Transit Commission",
    operator: "Toronto Transit Commission",
    country: "ca",
    city: "Toronto",
    region: "north-america",
    modes: ["metro", "tram", "bus"],
    kind: "api",
    homepage: "https://www.ttc.ca/service-alerts",
    endpoints: [URL, VEHICLES],
    attribution: "All data copyright Toronto Transit Commission.",
    intervalMinutes: 1,
    lat: 43.6532,
    lon: -79.3832,
  },
  async fetch(ctx) {
    const [data, veh] = await Promise.all([
      fetchJson<TtcResponse>(ctx, URL),
      fetchJson<{ vehicle?: TtcVehicle[] }>(ctx, VEHICLES),
    ]);
    return { ...parseTtc(data, ctx.now), vehicles: ttcVehicles(veh.vehicle ?? [], ctx.now) };
  },
};
