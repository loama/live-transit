import { gtfsRtConnector } from "@/lib/gtfs-rt";
import { cleanVehicles } from "./util";

const ALERTS = "https://data.calgary.ca/download/jhgn-ynqj/application%2Foctet-stream";
const VEHICLES = "https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream";

export const calgaryTransit = cleanVehicles(gtfsRtConnector(
  {
    id: "ca-calgary-transit",
    name: "Calgary Transit",
    operator: "City of Calgary",
    country: "ca",
    city: "Calgary",
    region: "north-america",
    modes: ["bus", "tram"],
    kind: "gtfs-rt",
    homepage: "https://www.calgarytransit.com/",
    endpoints: [ALERTS, VEHICLES],
    license: "Open Government Licence - City of Calgary",
    attribution: "Contains information licensed under the Open Government Licence - City of Calgary.",
    intervalMinutes: 1,
    lat: 51.0447,
    lon: -114.0719,
  },
  {
    defaultMode: "bus",
    alerts: ALERTS,
    vehicles: VEHICLES,
    routeModes: { "201": "tram", "202": "tram" },
    routeNames: { "201": "Red Line", "202": "Blue Line" },
  },
));
