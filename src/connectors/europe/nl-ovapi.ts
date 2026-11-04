import { gtfsRtConnector } from "@/lib/gtfs-rt";

export const nlOvapi = gtfsRtConnector(
  {
    id: "nl-ovapi",
    name: "Netherlands buses, trams and metro (OVapi)",
    operator: "OVapi / Dutch public transport operators",
    country: "nl",
    region: "europe",
    modes: ["bus", "tram", "metro", "ferry"],
    kind: "gtfs-rt",
    homepage: "https://www.ovapi.nl/",
    endpoints: ["https://gtfs.ovapi.nl/nl/alerts.pb", "https://gtfs.ovapi.nl/nl/vehiclePositions.pb"],
    attribution: "OVapi, Dutch NDOV open data",
    intervalMinutes: 2,
    lat: 52.1326,
    lon: 5.2913,
  },
  {
    defaultMode: "other",
    alerts: "https://gtfs.ovapi.nl/nl/alerts.pb",
    vehicles: "https://gtfs.ovapi.nl/nl/vehiclePositions.pb",
    languages: ["en", "nl", "NL"],
  },
);
