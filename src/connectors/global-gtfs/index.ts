import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector, Mode, Region } from "@/lib/types";
import feeds from "./feeds.json";

interface FeedEntry {
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
  alerts: string[];
  vehicles: string[];
}

export const globalGtfs: Connector[] = (feeds as FeedEntry[]).map((f) =>
  gtfsRtConnector(
    {
      id: f.id,
      name: f.name,
      operator: f.operator,
      country: f.country,
      city: f.city,
      region: f.region as Region,
      modes: f.modes as Mode[],
      kind: "gtfs-rt",
      homepage: f.homepage,
      endpoints: [...f.vehicles, ...f.alerts],
      license: f.license,
      intervalMinutes: f.vehicles.length ? 2 : 3,
      lat: f.lat,
      lon: f.lon,
    },
    {
      defaultMode: (f.modes[0] as Mode) ?? "bus",
      alerts: f.alerts.length ? f.alerts : undefined,
      vehicles: f.vehicles.length ? f.vehicles : undefined,
    },
  ),
);
