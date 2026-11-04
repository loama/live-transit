import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineStatus, Vehicle } from "@/lib/types";
import { hash, stripHtml } from "./util";

const BASE = "https://www.wsdot.wa.gov/ferries/api";
const VESSELS = `${BASE}/vessels/rest/vessellocations`;
const ALERTS = `${BASE}/schedule/rest/alerts`;
const ROUTES = (date: string) => `${BASE}/schedule/rest/routes/${date}`;
const KNOT = 0.514444;

interface Vessel {
  VesselID: number;
  VesselName: string;
  Latitude: number;
  Longitude: number;
  Speed: number;
  Heading: number;
  InService: boolean;
  DepartingTerminalName?: string;
  ArrivingTerminalName?: string;
  TimeStamp?: string;
}
interface WsfAlert {
  BulletinID: number;
  BulletinText: string;
  PublishDate?: string;
  RouteAlertText?: string;
  AlertFullTitle?: string;
  AffectedRouteIDs?: number[];
}
interface WsfRoute {
  RouteID: number;
  Description: string;
  ServiceDisruptions?: unknown[];
}

/** WSDOT serializes dates as /Date(1793806759000-0800)/. */
export function parseWsdotDate(s?: string): Date | undefined {
  const m = s?.match(/\/Date\((-?\d+)/);
  return m ? new Date(Number(m[1])) : undefined;
}

export const wsf: Connector = {
  meta: {
    id: "us-wa-wsf",
    name: "Washington State Ferries",
    operator: "Washington State Department of Transportation Ferries Division",
    country: "us",
    city: "Seattle",
    region: "north-america",
    modes: ["ferry"],
    kind: "api",
    homepage: "https://wsdot.com/ferries/vesselwatch/",
    endpoints: [VESSELS, ALERTS, `${BASE}/schedule/rest/routes/{date}`],
    attribution: "Data provided by WSDOT Ferries Division.",
    intervalMinutes: 1,
    lat: 47.6026,
    lon: -122.3393,
  },
  async fetch(ctx) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(ctx.now);
    const [vessels, bulletins, routes] = await Promise.all([
      fetchJson<Vessel[]>(ctx, VESSELS),
      fetchJson<WsfAlert[]>(ctx, ALERTS),
      fetchJson<WsfRoute[]>(ctx, ROUTES(today)),
    ]);
    const vehicles: Vehicle[] = vessels
      .filter((v) => v.InService && v.Latitude && v.Longitude)
      .map((v) => ({
        id: String(v.VesselID),
        mode: "ferry",
        routeName: v.DepartingTerminalName && v.ArrivingTerminalName ? `${v.DepartingTerminalName} to ${v.ArrivingTerminalName}` : undefined,
        headsign: v.ArrivingTerminalName,
        lat: v.Latitude,
        lon: v.Longitude,
        bearing: v.Heading,
        speed: v.Speed * KNOT,
        label: v.VesselName,
        observedAt: parseWsdotDate(v.TimeStamp),
      }));
    const routeNames = new Map(routes.map((r) => [r.RouteID, r.Description]));
    const alerts: Alert[] = bulletins
      .map((b) => ({ b, text: stripHtml(b.BulletinText) }))
      .filter((x) => x.text)
      .map(({ b, text }) => ({
        id: String(b.BulletinID ?? hash(text)),
        severity: "info" as const,
        title: (b.AlertFullTitle || text).slice(0, 200),
        description: text,
        routes: (b.AffectedRouteIDs ?? []).map((id) => routeNames.get(id) ?? `Route ${id}`),
        url: "https://wsdot.com/ferries/",
        modes: ["ferry" as const],
        activeFrom: parseWsdotDate(b.PublishDate),
      }));
    const lines: LineStatus[] = routes.map((r) => {
      const disrupted = (r.ServiceDisruptions?.length ?? 0) > 0;
      return {
        lineId: String(r.RouteID),
        lineName: r.Description,
        mode: "ferry",
        status: disrupted ? "minor" : "good",
        statusText: disrupted ? "Service disruption" : "Normal service",
      };
    });
    return { alerts, lines, vehicles };
  },
};
