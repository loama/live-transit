import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector, Mode } from "@/lib/types";
import { cachedZipRouteModes } from "./gtfs-zip-modes";

const ZIP = "https://gtfs.ovapi.nl/nl/gtfs-nl.zip";

const inner = gtfsRtConnector(
  {
    id: "nl-ovapi",
    name: "Netherlands buses, trams and metro (OVapi)",
    operator: "OVapi / Dutch public transport operators",
    country: "nl",
    region: "europe",
    modes: ["bus", "tram", "metro", "ferry", "rail"],
    kind: "gtfs-rt",
    homepage: "https://www.ovapi.nl/",
    endpoints: ["https://gtfs.ovapi.nl/nl/alerts.pb", "https://gtfs.ovapi.nl/nl/vehiclePositions.pb"],
    attribution: "OVapi, Dutch NDOV open data",
    intervalMinutes: 2,
    lat: 52.1326,
    lon: 5.2913,
  },
  {
    defaultMode: "bus",
    alerts: "https://gtfs.ovapi.nl/nl/alerts.pb",
    vehicles: "https://gtfs.ovapi.nl/nl/vehiclePositions.pb",
    languages: ["en", "nl", "NL"],
  },
);

export const nlOvapi: Connector = {
  meta: inner.meta,
  async fetch(ctx) {
    const [r, modes] = await Promise.all([inner.fetch(ctx), cachedZipRouteModes(ctx, ZIP).catch(() => ({}) as Record<string, Mode>)]);
    const of = (id: string | undefined): Mode => (id && modes[id]) || "bus";
    return {
      alerts: r.alerts?.map((a) => ({
        ...a,
        modes: a.routes?.length ? [...new Set(a.routes.map(of))] : a.modes,
      })),
      vehicles: r.vehicles?.map((v) => ({ ...v, mode: of(v.routeId) })),
    };
  },
};
