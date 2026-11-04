import { gtfsRtConnector } from "@/lib/gtfs-rt";

const cities = [
  "johor",
  "ipoh",
  "alor-setar",
  "kangar",
  "kota-bharu",
  "kuala-terengganu",
  "kuching",
  "melaka",
  "seremban-a",
  "seremban-b",
];
const urls = cities.map((c) => `https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-${c}/`);

export const myMybas = gtfsRtConnector(
  {
    id: "my-national-mybas",
    name: "myBAS Stage Buses",
    operator: "Ministry of Transport Malaysia, myBAS",
    country: "my",
    region: "asia",
    modes: ["bus"],
    kind: "gtfs-rt",
    homepage: "https://www.mot.gov.my/en",
    endpoints: urls,
    license: "Creative Commons Attribution 4.0 (data.gov.my)",
    attribution: "myBAS via data.gov.my",
    intervalMinutes: 1,
    lat: 4.2105,
    lon: 101.9758,
  },
  { vehicles: urls, defaultMode: "bus" },
);
