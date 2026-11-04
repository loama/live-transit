import { fetchText } from "@/lib/http";
import type { Connector, Mode } from "@/lib/types";
import { parseGpsTxt } from "./gps-txt";

const URL = "https://transport.tallinn.ee/gps.txt";

export const tallinnMode = (type: string): Mode => (type === "3" ? "tram" : "bus");

export const eeTallinnTransport: Connector = {
  meta: {
    id: "ee-tallinn-transport",
    name: "Tallinn city public transport",
    operator: "Tallinna Linnatransport",
    country: "ee",
    city: "Tallinn",
    region: "europe",
    modes: ["bus", "tram"],
    kind: "api",
    homepage: "https://transport.tallinn.ee/",
    endpoints: [URL],
    intervalMinutes: 1,
    lat: 59.437,
    lon: 24.7536,
  },
  async fetch(ctx) {
    const vehicles = parseGpsTxt(await fetchText(ctx, URL), tallinnMode);
    if (!vehicles.length) throw new Error("Tallinn gps.txt returned no vehicles");
    return { vehicles };
  },
};
