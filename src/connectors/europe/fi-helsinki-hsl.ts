import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Connector, Mode } from "@/lib/types";

const RT = "https://realtime.hsl.fi/realtime";

/** HSL route id conventions: 31Mx metro, 300x commuter rail, 1001-1010 tram, 1019 Suomenlinna ferry. */
export function hslMode(routeId?: string): Mode {
  const r = routeId ?? "";
  if (/^31M/.test(r)) return "metro";
  if (/^300\d/.test(r)) return "rail";
  if (/^10(0\d|10)/.test(r)) return "tram";
  if (/^1019/.test(r)) return "ferry";
  return "bus";
}

const base = gtfsRtConnector(
  {
    id: "fi-helsinki-hsl",
    name: "HSL Helsinki Region Transport",
    operator: "Helsingin seudun liikenne (HSL)",
    country: "fi",
    city: "Helsinki",
    region: "europe",
    modes: ["metro", "rail", "tram", "bus", "ferry"],
    kind: "gtfs-rt",
    homepage: "https://www.hsl.fi/en/hsl/news/service-updates",
    endpoints: [`${RT}/service-alerts/v2/hsl`, `${RT}/vehicle-positions/v2/hsl`],
    license: "CC BY 4.0",
    attribution: "Data source HSL, license Creative Commons BY 4.0",
    intervalMinutes: 1,
    lat: 60.1699,
    lon: 24.9384,
  },
  {
    defaultMode: "bus",
    alerts: `${RT}/service-alerts/v2/hsl`,
    vehicles: `${RT}/vehicle-positions/v2/hsl`,
    languages: ["en", "fi"],
  },
);

export const fiHelsinkiHsl: Connector = {
  meta: base.meta,
  async fetch(ctx) {
    const r = await base.fetch(ctx);
    return {
      alerts: r.alerts?.map((a) => ({ ...a, modes: [...new Set((a.routes ?? []).map(hslMode))] })).map((a) => ({
        ...a,
        modes: a.modes.length ? a.modes : (["bus"] as Mode[]),
      })),
      vehicles: r.vehicles?.map((v) => ({ ...v, mode: hslMode(v.routeId) })),
    };
  },
};
