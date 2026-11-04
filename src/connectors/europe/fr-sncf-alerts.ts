import { gtfsRtConnector } from "@/lib/gtfs-rt";

const URL = "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-service-alerts";

export const frSncfAlerts = gtfsRtConnector(
  {
    id: "fr-sncf-alerts",
    name: "SNCF TGV, Intercités and TER service alerts",
    operator: "SNCF Voyageurs",
    country: "fr",
    region: "europe",
    modes: ["rail"],
    kind: "gtfs-rt",
    homepage: "https://www.sncf-voyageurs.com/fr/voyagez-avec-nous/horaires-et-itineraires/info-trafic/",
    endpoints: [URL],
    license: "ODbL",
    attribution: "SNCF Voyageurs, via transport.data.gouv.fr (Open Database License)",
    intervalMinutes: 2,
    lat: 48.8443,
    lon: 2.3744,
  },
  { defaultMode: "rail", alerts: URL, languages: ["fr"] },
);
