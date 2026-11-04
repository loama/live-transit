import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector, Mode } from "@/lib/types";

const base = "https://gtfsrt.api.translink.com.au/api/realtime/SEQ";

/** SEQ rail routes are four letters plus a version, e.g. BRSH-5. Everything else is a bus route. */
export function seqMode(routeId: string | undefined): Mode {
  return routeId && /^[A-Z]{4}-\d+$/.test(routeId) ? "rail" : "bus";
}

const inner = gtfsRtConnector(
  {
    id: "au-brisbane-translink",
    name: "TransLink South East Queensland",
    operator: "TransLink (Queensland Government)",
    country: "au",
    city: "Brisbane",
    region: "oceania",
    modes: ["bus", "rail"],
    kind: "gtfs-rt",
    homepage: "https://translink.com.au/service-updates",
    endpoints: [`${base}/Alerts`, `${base}/VehiclePositions`],
    license: "Creative Commons Attribution 4.0",
    attribution: "Data provided by TransLink, Queensland Government",
    intervalMinutes: 1,
    lat: -27.4698,
    lon: 153.0251,
  },
  { alerts: `${base}/Alerts`, vehicles: `${base}/VehiclePositions`, defaultMode: "bus" },
);

export const auBrisbaneTranslink: Connector = {
  meta: inner.meta,
  async fetch(ctx) {
    const r = await inner.fetch(ctx);
    return {
      alerts: r.alerts?.map((a) => ({
        ...a,
        modes: [...new Set((a.routes?.length ? a.routes : [""]).map((x) => seqMode(x || undefined)))],
      })),
      vehicles: r.vehicles?.map((v) => ({ ...v, mode: seqMode(v.routeId) })),
    };
  },
};
