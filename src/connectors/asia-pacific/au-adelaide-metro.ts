import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector } from "@/lib/types";
import { decodeEntities } from "./util";

const base = "https://gtfs.adelaidemetro.com.au/v1/realtime";

const inner = gtfsRtConnector(
  {
    id: "au-adelaide-metro",
    name: "Adelaide Metro",
    operator: "Adelaide Metro (Department for Infrastructure and Transport, South Australia)",
    country: "au",
    city: "Adelaide",
    region: "oceania",
    modes: ["bus", "rail", "tram"],
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
      alerts: r.alerts?.map((a) => ({
        ...a,
        title: decodeEntities(a.title),
        description: a.description ? decodeEntities(a.description) : undefined,
      })),
    };
  },
};
