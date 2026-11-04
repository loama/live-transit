import { gtfsRtConnector } from "@/lib/gtfs-rt";

const base = "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana/?category=";
const categories = ["rapid-bus-kl", "rapid-bus-mrtfeeder", "rapid-bus-penang"];

export const myPrasaranaBus = gtfsRtConnector(
  {
    id: "my-klang-valley-rapid-bus",
    name: "Rapid KL, MRT Feeder and Rapid Penang Buses",
    operator: "Prasarana Malaysia Berhad",
    country: "my",
    city: "Kuala Lumpur",
    region: "asia",
    modes: ["bus"],
    kind: "gtfs-rt",
    homepage: "https://www.myrapid.com.my/traffic-updates/",
    endpoints: categories.map((c) => base + c),
    license: "Creative Commons Attribution 4.0 (data.gov.my)",
    attribution: "Prasarana Malaysia Berhad via data.gov.my",
    intervalMinutes: 1,
    lat: 3.139,
    lon: 101.6869,
  },
  { vehicles: categories.map((c) => base + c), defaultMode: "bus" },
);
