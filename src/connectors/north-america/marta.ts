import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector } from "@/lib/types";
import { cleanVehicles } from "./util";

const BASE = "https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService";
const ALERTS = `${BASE}/alert/alerts.pb`;
const VEHICLES = `${BASE}/vehicle/vehiclepositions.pb`;

const base = gtfsRtConnector(
  {
    id: "us-atlanta-marta",
    name: "MARTA Atlanta",
    operator: "Metropolitan Atlanta Rapid Transit Authority",
    country: "us",
    city: "Atlanta",
    region: "north-america",
    modes: ["bus"],
    kind: "gtfs-rt",
    homepage: "https://www.itsmarta.com/service-advisories.aspx",
    endpoints: [ALERTS, VEHICLES],
    attribution: "Data provided by MARTA.",
    intervalMinutes: 1,
    lat: 33.749,
    lon: -84.388,
  },
  { defaultMode: "bus", alerts: ALERTS, vehicles: VEHICLES },
);

/** MARTA publishes internal test messages ("Test 11:00") in its public alerts feed. */
const isTest = (title: string) => /^test\b/i.test(title);

export const marta: Connector = cleanVehicles({
  meta: base.meta,
  async fetch(ctx) {
    const r = await base.fetch(ctx);
    return { ...r, alerts: r.alerts?.filter((a) => !isTest(a.title)) };
  },
});
