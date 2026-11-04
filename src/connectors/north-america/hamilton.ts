import { gtfsRtConnector } from "@/lib/gtfs-rt";
import { cleanVehicles } from "./util";

const ALERTS = "https://opendata.hamilton.ca/GTFS-RT/GTFS_ServiceAlerts.pb";
const VEHICLES = "https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb";

export const hamiltonHsr = cleanVehicles(
  gtfsRtConnector(
    {
      id: "ca-hamilton-hsr",
      name: "Hamilton Street Railway",
      operator: "City of Hamilton",
      country: "ca",
      city: "Hamilton",
      region: "north-america",
      modes: ["bus"],
      kind: "gtfs-rt",
      homepage: "https://www.hamilton.ca/hsr",
      endpoints: [ALERTS, VEHICLES],
      license: "Open Government Licence - City of Hamilton",
      attribution: "Contains information licensed under the Open Government Licence - City of Hamilton.",
      intervalMinutes: 1,
      lat: 43.2557,
      lon: -79.8711,
    },
    { defaultMode: "bus", alerts: ALERTS, vehicles: VEHICLES },
  ),
);
