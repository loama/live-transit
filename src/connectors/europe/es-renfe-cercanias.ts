import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector } from "@/lib/types";
import { uniqueById } from "./util";

const base = gtfsRtConnector(
  {
    id: "es-renfe-cercanias",
    name: "Renfe Cercanias and regional rail",
    operator: "Renfe Operadora",
    country: "es",
    region: "europe",
    modes: ["rail"],
    kind: "gtfs-rt",
    homepage: "https://www.renfe.com/es/es/cercanias",
    endpoints: ["https://gtfsrt.renfe.com/alerts.pb", "https://gtfsrt.renfe.com/vehicle_positions.pb"],
    attribution: "Renfe Operadora, datos abiertos",
    intervalMinutes: 1,
    lat: 40.4168,
    lon: -3.7038,
  },
  {
    defaultMode: "rail",
    alerts: "https://gtfsrt.renfe.com/alerts.pb",
    vehicles: "https://gtfsrt.renfe.com/vehicle_positions.pb",
    languages: ["es"],
  },
);

export const esRenfeCercanias: Connector = {
  meta: base.meta,
  async fetch(ctx) {
    const r = await base.fetch(ctx);
    return { alerts: uniqueById(r.alerts ?? []), vehicles: uniqueById(r.vehicles ?? []) };
  },
};
