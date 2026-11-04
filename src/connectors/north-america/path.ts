import { fetchJson } from "@/lib/http";
import type { Connector, Departure } from "@/lib/types";

const URL = "https://www.panynj.gov/bin/portauthority/ridepath.json";

const STATIONS: Record<string, string> = {
  NWK: "Newark",
  HAR: "Harrison",
  JSQ: "Journal Square",
  GRV: "Grove Street",
  NEW: "Newport",
  EXP: "Exchange Place",
  HOB: "Hoboken",
  WTC: "World Trade Center",
  CHR: "Christopher Street",
  "09S": "9th Street",
  "14S": "14th Street",
  "23S": "23rd Street",
  "33S": "33rd Street",
};

interface PathMessage {
  target: string;
  secondsToArrival: string;
  arrivalTimeMessage: string;
  lineColor: string;
  headSign: string;
  lastUpdated: string;
}
interface PathResponse {
  results: { consideredStation: string; destinations: { label: string; messages: PathMessage[] }[] }[];
}

export function pathDepartures(data: PathResponse): Departure[] {
  const out: Departure[] = [];
  for (const st of data.results) {
    for (const dest of st.destinations) {
      for (const m of dest.messages) {
        const updated = new Date(m.lastUpdated).getTime();
        const secs = Number(m.secondsToArrival);
        if (!Number.isFinite(updated) || !Number.isFinite(secs)) continue;
        const at = new Date(Math.round((updated + secs * 1000) / 60_000) * 60_000);
        out.push({
          id: `${st.consideredStation}:${dest.label}:${m.headSign}:${at.getTime() / 60_000}`,
          stationId: st.consideredStation,
          stationName: STATIONS[st.consideredStation] ?? st.consideredStation,
          direction: "departure",
          mode: "metro",
          service: m.headSign,
          counterpart: m.headSign,
          scheduledAt: at,
          estimatedAt: at,
          status: "on_time",
          statusText: m.arrivalTimeMessage,
        });
      }
    }
  }
  return out;
}

export const path: Connector = {
  meta: {
    id: "us-nyc-nj-path",
    name: "PATH (Port Authority Trans-Hudson)",
    operator: "Port Authority of New York and New Jersey",
    country: "us",
    city: "New York",
    region: "north-america",
    modes: ["metro"],
    kind: "api",
    homepage: "https://www.panynj.gov/path/en/index.html",
    endpoints: [URL],
    attribution: "Data provided by the Port Authority of New York and New Jersey.",
    intervalMinutes: 1,
    lat: 40.7336,
    lon: -74.0276,
  },
  async fetch(ctx) {
    const data = await fetchJson<PathResponse>(ctx, URL);
    return { departures: pathDepartures(data) };
  },
};
