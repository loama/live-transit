import { fetchBuffer, fetchJson } from "@/lib/http";
import { alertsFromFeed, decodeFeed } from "@/lib/gtfs-rt";
import type { Connector, Departure } from "@/lib/types";
import { asArray } from "./util";

// Public demo key published by BART for open use: https://api.bart.gov/docs/overview/index.aspx
const KEY = "MW9S-E7SL-26DU-VV8V";
const ALERTS = "https://api.bart.gov/gtfsrt/alerts.aspx";
const ETD = `https://api.bart.gov/api/etd.aspx?cmd=etd&orig=ALL&key=${KEY}&json=y`;

interface Estimate {
  minutes: string;
  platform: string;
  direction: string;
  color: string;
  delay: string;
  cancelflag: string;
}
interface Etd {
  destination: string;
  abbreviation: string;
  estimate: Estimate | Estimate[];
}
interface EtdStation {
  name: string;
  abbr: string;
  etd?: Etd | Etd[];
}

export function bartDepartures(stations: EtdStation[], now: Date): Departure[] {
  const out: Departure[] = [];
  for (const s of stations) {
    for (const e of asArray(s.etd)) {
      for (const est of asArray(e.estimate)) {
        const minutes = est.minutes === "Leaving" ? 0 : Number(est.minutes);
        if (!Number.isFinite(minutes)) continue;
        const delay = Math.max(0, Number(est.delay) || 0);
        const estimatedAt = new Date(Math.round((now.getTime() + minutes * 60_000) / 60_000) * 60_000);
        const cancelled = est.cancelflag === "1";
        out.push({
          id: `${s.abbr}:${e.abbreviation}:${est.platform}:${est.color}:${estimatedAt.getTime() / 60_000}`,
          stationId: s.abbr,
          stationName: s.name,
          direction: "departure",
          mode: "metro",
          service: `${est.color[0]}${est.color.slice(1).toLowerCase()} line`,
          counterpart: e.destination,
          scheduledAt: new Date(estimatedAt.getTime() - delay * 1000),
          estimatedAt,
          platform: est.platform,
          status: cancelled ? "cancelled" : delay >= 60 ? "delayed" : "on_time",
          statusText: delay >= 60 ? `${Math.round(delay / 60)} min late` : undefined,
          delayMinutes: Math.round(delay / 60),
        });
      }
    }
  }
  return out;
}

export const bart: Connector = {
  meta: {
    id: "us-sf-bart",
    name: "BART San Francisco Bay Area",
    operator: "San Francisco Bay Area Rapid Transit District",
    country: "us",
    city: "San Francisco",
    region: "north-america",
    modes: ["metro"],
    kind: "api",
    homepage: "https://www.bart.gov/schedules/advisories",
    endpoints: [ALERTS, "https://api.bart.gov/api/etd.aspx"],
    license: "BART API license agreement",
    attribution: "Data provided by BART.",
    intervalMinutes: 1,
    lat: 37.7749,
    lon: -122.4194,
  },
  async fetch(ctx) {
    const [buf, etd] = await Promise.all([
      fetchBuffer(ctx, ALERTS),
      fetchJson<{ root: { station: EtdStation[] } }>(ctx, ETD),
    ]);
    const alerts = alertsFromFeed(decodeFeed(buf), { defaultMode: "metro" }, ctx.now);
    const departures = bartDepartures(etd.root.station ?? [], ctx.now);
    return { alerts, departures };
  },
};
