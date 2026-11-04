import { gtfsRtConnector } from "@/lib/gtfs-rt";
import { cleanVehicles } from "./util";

const ALERTS = "https://gtfs.halifax.ca/realtime/Alert/Alerts.pb";
const VEHICLES = "https://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb";

export const halifaxTransit = cleanVehicles(
  gtfsRtConnector(
    {
      id: "ca-halifax-transit",
      name: "Halifax Transit",
      operator: "Halifax Regional Municipality",
      country: "ca",
      city: "Halifax",
      region: "north-america",
      modes: ["bus"],
      kind: "gtfs-rt",
      homepage: "https://www.halifax.ca/transportation/halifax-transit",
      endpoints: [ALERTS, VEHICLES],
      license: "Halifax Open Data Licence",
      attribution: "Contains information licensed under the Halifax Open Data Licence.",
      intervalMinutes: 1,
      lat: 44.6488,
      lon: -63.5752,
    },
    { defaultMode: "bus", alerts: ALERTS, vehicles: VEHICLES },
  ),
);
