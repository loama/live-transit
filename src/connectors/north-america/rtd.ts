import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Mode } from "@/lib/types";
import { cleanVehicles } from "./util";

const ALERTS = "https://www.rtd-denver.com/files/gtfs-rt/Alerts.pb";
const VEHICLES = "https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb";

const RAIL_LINES = ["A", "B", "D", "E", "F", "G", "H", "L", "N", "R", "W"];

export const rtdDenver = cleanVehicles(
  gtfsRtConnector(
    {
      id: "us-denver-rtd",
      name: "RTD Denver",
      operator: "Regional Transportation District",
      country: "us",
      city: "Denver",
      region: "north-america",
      modes: ["bus", "rail", "tram"],
      kind: "gtfs-rt",
      homepage: "https://www.rtd-denver.com/rider-alerts",
      endpoints: [ALERTS, VEHICLES],
      attribution: "Data provided by the Regional Transportation District.",
      intervalMinutes: 1,
      lat: 39.7392,
      lon: -104.9903,
    },
    {
      defaultMode: "bus",
      alerts: ALERTS,
      vehicles: VEHICLES,
      routeModes: Object.fromEntries(RAIL_LINES.map((l) => [l, "rail" as Mode])),
      routeNames: Object.fromEntries(RAIL_LINES.map((l) => [l, `${l} Line`])),
    },
  ),
);
