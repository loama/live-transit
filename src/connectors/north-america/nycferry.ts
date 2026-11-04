import { gtfsRtConnector } from "@/lib/gtfs-rt";
import { cleanVehicles } from "./util";

const VEHICLES = "https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition";

export const nycFerry = cleanVehicles(gtfsRtConnector(
  {
    id: "us-nyc-ferry",
    name: "NYC Ferry",
    operator: "NYC Ferry (Hornblower)",
    country: "us",
    city: "New York",
    region: "north-america",
    modes: ["ferry"],
    kind: "gtfs-rt",
    homepage: "https://www.ferry.nyc/",
    endpoints: [VEHICLES],
    attribution: "Data provided by NYC Ferry.",
    intervalMinutes: 1,
    lat: 40.7006,
    lon: -74.0149,
  },
  { defaultMode: "ferry", vehicles: VEHICLES },
));
