import { fetchBuffer, fetchJson } from "@/lib/http";
import { decodeFeed, severityFromEffect, vehiclesFromFeed } from "@/lib/gtfs-rt";
import type { Alert, Connector, Mode } from "@/lib/types";
import { cleanVehicles } from "./util";

const ALERTS = "https://data.texas.gov/download/9zu9-jwr2/application%2Foctet-stream";
const VEHICLES = "https://data.texas.gov/download/eiei-9rpf/application%2Foctet-stream";

const routeModes: Record<string, Mode> = { "550": "rail" };
const routeNames: Record<string, string> = { "550": "MetroRail Red Line" };

interface CapAlert {
  id: string;
  cause?: string;
  effect?: string;
  url?: string;
  headerText?: string;
  descriptionText?: string;
  deletedAt?: string | null;
  activePeriods?: { start?: string; end?: string }[];
  informedEntities?: { routeId?: string; stopId?: string }[];
}

export function parseCapMetroAlerts(list: CapAlert[], now: Date): Alert[] {
  const out: Alert[] = [];
  for (const a of list) {
    if (a.deletedAt || !a.headerText) continue;
    const periods = a.activePeriods ?? [];
    const cur = periods.find((p) => (!p.start || new Date(p.start) <= now) && (!p.end || new Date(p.end) >= now));
    if (periods.length && !cur) continue;
    const routeIds = [...new Set((a.informedEntities ?? []).map((e) => e.routeId).filter(Boolean) as string[])];
    const modes = [...new Set(routeIds.map((r) => routeModes[r] ?? "bus"))];
    out.push({
      id: a.id,
      severity: severityFromEffect(a.effect),
      effect: a.effect,
      cause: a.cause && a.cause !== "UNKNOWN_CAUSE" ? a.cause : undefined,
      title: a.headerText,
      description: a.descriptionText,
      url: a.url,
      modes: modes.length ? modes : ["bus"],
      routes: routeIds.map((r) => routeNames[r] ?? `Route ${r}`),
      stops: [...new Set((a.informedEntities ?? []).map((e) => e.stopId).filter(Boolean) as string[])],
      activeFrom: cur?.start ? new Date(cur.start) : undefined,
      activeUntil: cur?.end ? new Date(cur.end) : undefined,
    });
  }
  return out;
}

export const capMetro: Connector = cleanVehicles({
  meta: {
    id: "us-austin-capmetro",
    name: "CapMetro Austin",
    operator: "Capital Metropolitan Transportation Authority",
    country: "us",
    city: "Austin",
    region: "north-america",
    modes: ["bus", "rail"],
    kind: "gtfs-rt",
    homepage: "https://www.capmetro.org/alerts",
    endpoints: [ALERTS, VEHICLES],
    license: "Texas Open Data Portal",
    attribution: "Data provided by Capital Metro via the Texas Open Data Portal.",
    intervalMinutes: 1,
    lat: 30.2672,
    lon: -97.7431,
  },
  async fetch(ctx) {
    const [alerts, vehBuf] = await Promise.all([fetchJson<CapAlert[]>(ctx, ALERTS), fetchBuffer(ctx, VEHICLES)]);
    return {
      alerts: parseCapMetroAlerts(alerts, ctx.now),
      vehicles: vehiclesFromFeed(decodeFeed(vehBuf), { defaultMode: "bus", routeModes, routeNames }),
    };
  },
});
