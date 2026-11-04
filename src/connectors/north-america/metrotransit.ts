import { fetchBuffer, fetchJson } from "@/lib/http";
import { alertsFromFeed, decodeFeed, vehiclesFromFeed, type GtfsRtOptions } from "@/lib/gtfs-rt";
import type { Connector, Mode } from "@/lib/types";
import { cleanVehicles } from "./util";

const ALERTS = "https://svc.metrotransit.org/mtgtfs/alerts.pb";
const VEHICLES = "https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb";
const ROUTES = "https://svc.metrotransit.org/nextripv2/routes";

const LIGHT_RAIL: Record<string, Mode> = { "901": "tram", "902": "tram" };

export const metroTransitMn: Connector = cleanVehicles({
  meta: {
    id: "us-minneapolis-metro-transit",
    name: "Metro Transit Minneapolis-St. Paul",
    operator: "Metro Transit",
    country: "us",
    city: "Minneapolis",
    region: "north-america",
    modes: ["bus", "tram"],
    kind: "gtfs-rt",
    homepage: "https://www.metrotransit.org/service-alerts",
    endpoints: [ALERTS, VEHICLES, ROUTES],
    attribution: "Data provided by Metro Transit.",
    intervalMinutes: 1,
    lat: 44.9778,
    lon: -93.265,
  },
  async fetch(ctx) {
    const [routes, alertBuf, vehBuf] = await Promise.all([
      fetchJson<{ route_id: string; route_label: string }[]>(ctx, ROUTES),
      fetchBuffer(ctx, ALERTS),
      fetchBuffer(ctx, VEHICLES),
    ]);
    const opts: GtfsRtOptions = {
      defaultMode: "bus",
      routeModes: LIGHT_RAIL,
      routeNames: Object.fromEntries(routes.map((r) => [r.route_id, r.route_label])),
    };
    return {
      alerts: alertsFromFeed(decodeFeed(alertBuf), opts, ctx.now),
      vehicles: vehiclesFromFeed(decodeFeed(vehBuf), opts),
    };
  },
});
