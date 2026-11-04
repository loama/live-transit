import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector, Mode } from "@/lib/types";
import { decodeEntities } from "./util";

const base = "https://gtfs.adelaidemetro.com.au/v1/realtime";

const TRAMS = new Set(["GLNELG", "BTANIC", "FESTVL"]);
const RAIL = new Set(["BEL", "FLNDRS", "GAW", "GAWC", "GRNG", "NOAR", "OSBORN", "OUTHA", "PTDOCK", "SALIS", "SEAFRD"]);

/** Adelaide Metro route ids: numbered and lettered bus routes, plus a short fixed set of tram and rail ids. */
export function adelaideMode(routeId: string | undefined): Mode {
  if (!routeId) return "bus";
  if (TRAMS.has(routeId)) return "tram";
  if (RAIL.has(routeId)) return "rail";
  return routeId === "SEALNK" ? "ferry" : "bus";
}

const inner = gtfsRtConnector(
  {
    id: "au-adelaide-metro",
    name: "Adelaide Metro",
    operator: "Adelaide Metro (Department for Infrastructure and Transport, South Australia)",
    country: "au",
    city: "Adelaide",
    region: "oceania",
    modes: ["bus", "rail", "tram", "ferry"],
    kind: "gtfs-rt",
    homepage: "https://www.adelaidemetro.com.au/service-disruptions",
    endpoints: [`${base}/service_alerts`, `${base}/vehicle_positions`],
    license: "Creative Commons Attribution 4.0",
    attribution: "Data provided by the Government of South Australia (Adelaide Metro)",
    intervalMinutes: 1,
    lat: -34.9285,
    lon: 138.6007,
  },
  { alerts: `${base}/service_alerts`, vehicles: `${base}/vehicle_positions`, defaultMode: "bus" },
);

export const auAdelaideMetro: Connector = {
  meta: inner.meta,
  async fetch(ctx) {
    const r = await inner.fetch(ctx);
    return {
      ...r,
      vehicles: r.vehicles?.map((v) => ({ ...v, mode: adelaideMode(v.routeId) })),
      alerts: r.alerts?.map((a) => ({
        ...a,
        modes: [...new Set((a.routes?.length ? a.routes : [""]).map((x) => adelaideMode(x || undefined)))],
        title: decodeEntities(a.title),
        description: a.description ? decodeEntities(a.description) : undefined,
      })),
    };
  },
};
