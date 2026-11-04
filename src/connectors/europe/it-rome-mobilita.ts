import { gtfsRtConnector } from "@/lib/gtfs-rt";

const BASE = "https://romamobilita.it/sites/default/files";

export const itRomeMobilita = gtfsRtConnector(
  {
    id: "it-rome-mobilita",
    name: "Roma Mobilita public transport",
    operator: "Roma servizi per la Mobilità",
    country: "it",
    city: "Rome",
    region: "europe",
    modes: ["bus", "tram", "metro"],
    kind: "gtfs-rt",
    homepage: "https://romamobilita.it/it/viaggia-con-noi/info-in-tempo-reale",
    endpoints: [`${BASE}/rome_rtgtfs_service_alerts_feed.pb`, `${BASE}/rome_rtgtfs_vehicle_positions_feed.pb`],
    attribution: "Roma Servizi per la Mobilità, open data",
    intervalMinutes: 1,
    lat: 41.9028,
    lon: 12.4964,
  },
  {
    defaultMode: "other",
    alerts: `${BASE}/rome_rtgtfs_service_alerts_feed.pb`,
    vehicles: `${BASE}/rome_rtgtfs_vehicle_positions_feed.pb`,
    languages: ["it"],
  },
);
