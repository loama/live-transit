import { gtfsRtConnector } from "@/lib/gtfs-rt";

const url = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb/";

export const myKtmb = gtfsRtConnector(
  {
    id: "my-national-ktmb",
    name: "KTMB Train Positions",
    operator: "Keretapi Tanah Melayu Berhad",
    country: "my",
    region: "asia",
    modes: ["rail"],
    kind: "gtfs-rt",
    homepage: "https://www.ktmb.com.my/",
    endpoints: [url],
    license: "Creative Commons Attribution 4.0 (data.gov.my)",
    attribution: "KTMB via data.gov.my",
    intervalMinutes: 1,
    lat: 3.139,
    lon: 101.6869,
  },
  { vehicles: url, defaultMode: "rail" },
);
