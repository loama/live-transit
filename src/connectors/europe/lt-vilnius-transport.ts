import { fetchText } from "@/lib/http";
import type { Connector } from "@/lib/types";
import { parseGpsTxt } from "./gps-txt";

const URL = "https://www.stops.lt/vilnius/gps.txt";

export const ltVilniusTransport: Connector = {
  meta: {
    id: "lt-vilnius-transport",
    name: "Vilnius public transport",
    operator: "Vilniaus viešasis transportas",
    country: "lt",
    city: "Vilnius",
    region: "europe",
    modes: ["bus"],
    kind: "api",
    homepage: "https://www.stops.lt/vilnius/",
    endpoints: [URL],
    intervalMinutes: 1,
    lat: 54.6872,
    lon: 25.2797,
  },
  async fetch(ctx) {
    const vehicles = parseGpsTxt(await fetchText(ctx, URL), () => "bus");
    if (!vehicles.length) throw new Error("Vilnius gps.txt returned no vehicles");
    return { vehicles };
  },
};
