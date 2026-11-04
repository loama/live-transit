import { gtfsRtConnector } from "@/lib/gtfs-rt";
import { cleanVehicles } from "./util";

const ALERTS = "https://s3.amazonaws.com/kcm-alerts-realtime-prod/alerts.pb";
const VEHICLES = "https://s3.amazonaws.com/kcm-alerts-realtime-prod/vehiclepositions.pb";

export const kingCountyMetro = cleanVehicles(gtfsRtConnector(
  {
    id: "us-seattle-king-county-metro",
    name: "King County Metro",
    operator: "King County Metro Transit",
    country: "us",
    city: "Seattle",
    region: "north-america",
    modes: ["bus"],
    kind: "gtfs-rt",
    homepage: "https://kingcounty.gov/en/dept/metro/rider-tools/service-advisories",
    endpoints: [ALERTS, VEHICLES],
    license: "King County open data terms",
    attribution: "Data provided by King County Metro.",
    intervalMinutes: 1,
    lat: 47.6062,
    lon: -122.3321,
  },
  { defaultMode: "bus", alerts: ALERTS, vehicles: VEHICLES },
));
