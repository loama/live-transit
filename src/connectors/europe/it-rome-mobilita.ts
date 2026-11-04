import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector, Mode } from "@/lib/types";

const BASE = "https://romamobilita.it/sites/default/files";

const METRO = new Set(["MEA", "MEB", "MEB1", "MEC"]);
const TRAM = new Set(["2", "3", "5", "8", "14"]);

/** Rome route ids: metro lines are ME*, the five tram lines are bare numbers, everything else is a bus. */
export function romeMode(routeId: string | undefined): Mode {
  if (!routeId) return "bus";
  return METRO.has(routeId) ? "metro" : TRAM.has(routeId) ? "tram" : "bus";
}

const inner = gtfsRtConnector(
  {
    id: "it-rome-mobilita",
    name: "Roma Mobilita public transport",
    operator: "Roma servizi per la Mobilità",
    country: "it",
    city: "Rome",
    region: "europe",
    modes: ["bus", "tram", "metro"],
    kind: "gtfs-rt",
    homepage: "https://romamobilita.it/it/viaggia-con-noi/info-in-tempo-reale",
    endpoints: [`${BASE}/rome_rtgtfs_service_alerts_feed.pb`, `${BASE}/rome_rtgtfs_vehicle_positions_feed.pb`],
    attribution: "Roma Servizi per la Mobilità, open data",
    intervalMinutes: 1,
    lat: 41.9028,
    lon: 12.4964,
  },
  {
    defaultMode: "bus",
    alerts: `${BASE}/rome_rtgtfs_service_alerts_feed.pb`,
    vehicles: `${BASE}/rome_rtgtfs_vehicle_positions_feed.pb`,
    languages: ["it"],
  },
);

export const itRomeMobilita: Connector = {
  meta: inner.meta,
  async fetch(ctx) {
    const r = await inner.fetch(ctx);
    return {
      alerts: r.alerts?.map((a) => ({
        ...a,
        modes: [...new Set((a.routes?.length ? a.routes : [""]).map((x) => romeMode(x || undefined)))],
      })),
      vehicles: r.vehicles?.map((v) => ({ ...v, mode: romeMode(v.routeId) })),
    };
  },
};
