import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineStatus, Mode, Vehicle } from "@/lib/types";
import { hash, parseUsDateTime, stripHtml } from "./util";

const ALERTS = "https://www3.septa.org/api/Alerts/get_alert_data.php";
const TRAINS = "https://www3.septa.org/api/TrainView/index.php";
const BUSES = "https://www3.septa.org/api/TransitViewAll/index.php";
const TZ = "America/New_York";

interface SeptaAlert {
  route_id: string;
  route_name: string;
  current_message: string | null;
  advisory_id: string | null;
  advisory_message: string | null;
  detour_message: string | null;
  detour_id: string | null;
  detour_start_date_time: string | null;
  detour_end_date_time: string | null;
  detour_reason: string | null;
}
interface SeptaTrain {
  lat: string;
  lon: string;
  trainno: string;
  dest: string;
  line: string;
  heading: string;
  late: number;
  nextstop: string;
}
interface SeptaBus {
  lat: string;
  lng: string;
  VehicleID: string;
  route_id: string;
  destination: string;
  heading: number;
  late: number;
  trip: string;
  timestamp: number;
}

const TROLLEY = new Set(["10", "11", "13", "15", "34", "36", "101", "102"]);
const RAIL_ROUTE = /^(rr_route_|trolley_route_)/;

export function septaRouteMode(routeId: string): Mode {
  if (routeId === "rr_route_mfl" || routeId === "rr_route_mfo" || routeId === "rr_route_bsl" || routeId === "rr_route_bso") return "metro";
  if (routeId.startsWith("trolley_route_") || routeId === "rr_route_nhsl") return "tram";
  if (routeId.startsWith("rr_route_")) return "rail";
  return "bus";
}

export function septaAlerts(rows: SeptaAlert[], now: Date): { alerts: Alert[]; lines: LineStatus[] } {
  const alerts: Alert[] = [];
  const lines: LineStatus[] = [];
  for (const r of rows) {
    if (r.route_id === "APP" || r.route_id === "generic" || r.route_id === "cct") continue;
    const mode = septaRouteMode(r.route_id);
    const name = mode === "bus" ? `Route ${r.route_name}` : r.route_name;
    const base = { modes: [mode], routes: [name] };
    const current = stripHtml(r.current_message);
    const advisory = stripHtml(r.advisory_message);
    const detour = stripHtml(r.detour_message);
    if (current)
      alerts.push({ id: `${r.route_id}:service:${hash(current)}`, severity: "minor", title: current.slice(0, 200), description: current, ...base });
    if (advisory)
      alerts.push({ id: `${r.route_id}:adv:${r.advisory_id ?? hash(advisory)}`, severity: "info", title: advisory.slice(0, 200), description: advisory, ...base });
    if (detour) {
      const from = r.detour_start_date_time ? parseUsDateTime(r.detour_start_date_time, TZ) : undefined;
      const until = r.detour_end_date_time ? parseUsDateTime(r.detour_end_date_time, TZ) : undefined;
      if ((!from || from <= now) && (!until || until >= now))
        alerts.push({
          id: `${r.route_id}:detour:${r.detour_id ?? hash(detour)}`,
          severity: "minor",
          effect: "DETOUR",
          cause: r.detour_reason ?? undefined,
          title: `${name} detour`,
          description: detour,
          activeFrom: from,
          activeUntil: until,
          ...base,
        });
    }
    if (RAIL_ROUTE.test(r.route_id) && !lines.some((l) => l.lineId === r.route_id))
      lines.push({
        lineId: r.route_id,
        lineName: r.route_name,
        mode,
        status: current ? "minor" : "good",
        statusText: current ? current.slice(0, 200) : "Normal service",
      });
  }
  return { alerts, lines };
}

export const septa: Connector = {
  meta: {
    id: "us-philadelphia-septa",
    name: "SEPTA Philadelphia",
    operator: "Southeastern Pennsylvania Transportation Authority",
    country: "us",
    city: "Philadelphia",
    region: "north-america",
    modes: ["rail", "metro", "tram", "bus"],
    kind: "api",
    homepage: "https://www.septa.org/service-status/",
    endpoints: [ALERTS, TRAINS, BUSES],
    attribution: "Data provided by SEPTA.",
    intervalMinutes: 1,
    lat: 39.9526,
    lon: -75.1652,
  },
  async fetch(ctx) {
    const [rows, trains, buses] = await Promise.all([
      fetchJson<SeptaAlert[]>(ctx, ALERTS),
      fetchJson<SeptaTrain[]>(ctx, TRAINS),
      fetchJson<{ routes: Record<string, SeptaBus[]>[] }>(ctx, BUSES),
    ]);
    const { alerts, lines } = septaAlerts(rows, ctx.now);
    const vehicles: Vehicle[] = trains.map((t) => ({
      id: `train-${t.trainno}`,
      mode: "rail",
      routeName: t.line,
      headsign: t.dest,
      lat: Number(t.lat),
      lon: Number(t.lon),
      bearing: Number.isFinite(Number(t.heading)) ? Number(t.heading) : undefined,
      label: t.trainno,
      delaySeconds: t.late * 60,
    }));
    for (const group of buses.routes)
      for (const list of Object.values(group))
        for (const b of list) {
          const lat = Number(b.lat);
          const lon = Number(b.lng);
          if (!lat || !lon) continue;
          vehicles.push({
            id: `bus-${b.VehicleID}`,
            mode: TROLLEY.has(b.route_id) ? "tram" : "bus",
            routeId: b.route_id,
            routeName: b.route_id,
            tripId: b.trip,
            headsign: b.destination,
            lat,
            lon,
            bearing: b.heading,
            label: b.VehicleID,
            delaySeconds: Number.isFinite(b.late) ? b.late * 60 : undefined,
            observedAt: b.timestamp ? new Date(b.timestamp * 1000) : undefined,
          });
        }
    return { alerts, lines, vehicles };
  },
};
