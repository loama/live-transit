import type { Connector, Mode, Region } from "@/lib/types";
import feeds from "./feeds.json";
import extra from "./extra-feeds.json";
import more from "./more-feeds.json";
import gap from "./gap-feeds.json";

export interface ScheduleFeed {
  id: string;
  name: string;
  operator: string;
  country: string;
  city?: string;
  region: string;
  modes: string[];
  homepage: string;
  lat?: number;
  lon?: number;
  license?: string;
  static: string[];
  origin: string;
}

export const scheduleFeeds = [...(feeds as ScheduleFeed[]), ...(extra as ScheduleFeed[]), ...(more as ScheduleFeed[]), ...(gap as ScheduleFeed[])];

/**
 * Networks that publish a timetable but no live feed. Polling returns nothing of its own; the runner fills in
 * one line per route from the imported catalog, so these show lines, maps and stops without live status.
 */
export const schedule: Connector[] = scheduleFeeds.map((f) => ({
  meta: {
    id: f.id,
    name: f.name,
    operator: f.operator,
    country: f.country,
    city: f.city,
    region: f.region as Region,
    modes: f.modes as Mode[],
    kind: "schedule",
    homepage: f.homepage,
    endpoints: f.static,
    license: f.license,
    intervalMinutes: 1440,
    lat: f.lat,
    lon: f.lon,
  },
  fetch: async () => ({}),
}));
