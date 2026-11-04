import { gtfsRtConnector } from "@/lib/gtfs-rt";
import { cleanVehicles } from "./util";

const BASE = "https://gtfs.edmonton.ca/TMGTFSRealTimeWebService";
const ALERTS = `${BASE}/Alert/Alerts.pb`;
const VEHICLES = `${BASE}/Vehicle/VehiclePositions.pb`;

export const edmontonEts = cleanVehicles(gtfsRtConnector(
  {
    id: "ca-edmonton-ets",
    name: "Edmonton Transit Service",
    operator: "City of Edmonton",
    country: "ca",
    city: "Edmonton",
    region: "north-america",
    modes: ["bus"],
    kind: "gtfs-rt",
    homepage: "https://www.edmonton.ca/ets",
    endpoints: [ALERTS, VEHICLES],
    license: "City of Edmonton Open Data Terms of Use",
    attribution: "Contains information licensed under the City of Edmonton Open Data Terms of Use.",
    intervalMinutes: 1,
    lat: 53.5461,
    lon: -113.4938,
  },
  {
    defaultMode: "bus",
    alerts: ALERTS,
    vehicles: VEHICLES,
  },
));
