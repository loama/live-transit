import { fetchJson, fetchBuffer } from "@/lib/http";
import { alertsFromFeed, decodeFeed, vehiclesFromFeed, type GtfsRtOptions } from "@/lib/gtfs-rt";
import type { Alert, Connector, Mode } from "@/lib/types";
import { linesFromAlerts, type LineDef } from "./util";

const ROUTES = "https://api-v3.mbta.com/routes?filter[type]=0,1,2,4&fields[route]=type,long_name,short_name,color";
const ALERTS = "https://cdn.mbta.com/realtime/Alerts.pb";
const VEHICLES = "https://cdn.mbta.com/realtime/VehiclePositions.pb";

interface MbtaRoute {
  id: string;
  attributes: { type: number; long_name: string; short_name: string; color: string };
}

const MODE_BY_TYPE: Record<number, Mode> = { 0: "tram", 1: "metro", 2: "rail", 3: "bus", 4: "ferry" };

const SERVICE_EFFECTS = new Set(["NO_SERVICE", "REDUCED_SERVICE", "SIGNIFICANT_DELAYS", "DETOUR", "MODIFIED_SERVICE"]);

/** A NO_SERVICE alert that only names stops (a station closed or skipped) does not suspend the line. */
export function stopLevelClosure(a: Alert): boolean {
  return a.effect === "NO_SERVICE" && (a.stops?.length ?? 0) > 0;
}

/** MBTA rates track changes, notices and accessibility items as high as service loss; keep those below major. */
export function tameAlert(a: Alert): Alert {
  if (stopLevelClosure(a)) return { ...a, severity: "minor" };
  if (!SERVICE_EFFECTS.has(a.effect ?? "") && (a.severity === "severe" || a.severity === "major")) return { ...a, severity: "minor" };
  return a;
}

export const mbta: Connector = {
  meta: {
    id: "us-boston-mbta",
    name: "MBTA Boston",
    operator: "Massachusetts Bay Transportation Authority",
    country: "us",
    city: "Boston",
    region: "north-america",
    modes: ["metro", "tram", "rail", "bus", "ferry"],
    kind: "gtfs-rt",
    homepage: "https://www.mbta.com/alerts",
    endpoints: [ALERTS, VEHICLES, "https://api-v3.mbta.com/routes"],
    license: "MBTA developer license agreement",
    attribution: "Data provided by the Massachusetts Bay Transportation Authority.",
    intervalMinutes: 1,
    lat: 42.3601,
    lon: -71.0589,
  },
  async fetch(ctx) {
    const [routes, alertBuf, vehBuf] = await Promise.all([
      fetchJson<{ data: MbtaRoute[] }>(ctx, ROUTES),
      fetchBuffer(ctx, ALERTS),
      fetchBuffer(ctx, VEHICLES),
    ]);
    const routeNames: Record<string, string> = {};
    const routeModes: Record<string, Mode> = {};
    const defs: LineDef[] = [];
    for (const r of routes.data) {
      const name = r.attributes.long_name || r.attributes.short_name || r.id;
      routeNames[r.id] = name;
      routeModes[r.id] = MODE_BY_TYPE[r.attributes.type] ?? "bus";
      defs.push({ id: r.id, name, mode: routeModes[r.id], color: r.attributes.color || undefined });
    }
    const opts: GtfsRtOptions = { defaultMode: "bus", routeModes };
    const alerts = alertsFromFeed(decodeFeed(alertBuf), opts, ctx.now).map(tameAlert);
    const vehicles = vehiclesFromFeed(decodeFeed(vehBuf), { ...opts, routeNames });
    const named = alerts.map((a) => ({ ...a, routes: a.routes?.map((r) => routeNames[r] ?? r) }));
    return { alerts: named, lines: linesFromAlerts(defs, alerts.map((a) => (stopLevelClosure(a) ? { ...a, effect: "MODIFIED_SERVICE" } : a))), vehicles };
  },
};
