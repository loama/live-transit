import { fetchJson } from "@/lib/http";
import type { Alert, Connector, Departure, Severity } from "@/lib/types";
import { departureState, hashId, stationFromBoard } from "./util";

const BASE = "https://api.irail.be";

const STATIONS = [
  { id: "BE.NMBS.008813003", name: "Brussels-Central", lat: 50.8457, lon: 4.3568 },
  { id: "BE.NMBS.008814001", name: "Brussels-South", lat: 50.8355, lon: 4.3365 },
  { id: "BE.NMBS.008812005", name: "Brussels-North", lat: 50.8603, lon: 4.3607 },
  { id: "BE.NMBS.008821006", name: "Antwerp-Central", lat: 51.2172, lon: 4.4212 },
  { id: "BE.NMBS.008892007", name: "Ghent-Sint-Pieters", lat: 51.0357, lon: 3.7106 },
  { id: "BE.NMBS.008841004", name: "Liège-Guillemins", lat: 50.6245, lon: 5.5665 },
];

interface Disturbance {
  title: string;
  description: string;
  type: string;
  link?: string;
  timestamp: string;
}
interface LiveDep {
  station: string;
  time: string;
  delay: string;
  canceled: string;
  vehicle: string;
  vehicleinfo?: { shortname?: string };
  platform?: string;
  platforminfo?: { normal?: string };
}

export function disturbanceSeverity(d: Pick<Disturbance, "title" | "type">): Severity {
  if (d.type === "planned") return "info";
  if (/no trains|suspended|interrupted/i.test(d.title)) return "severe";
  return "minor";
}

export function alertsFromDisturbances(list: Disturbance[]): Alert[] {
  return list.map((d) => {
    const messageId = d.link?.match(/messageID=(\d+)/)?.[1];
    return {
      id: messageId ?? hashId(`${d.type}|${d.title}|${d.link}|${d.timestamp}`),
      severity: disturbanceSeverity(d),
      title: d.title,
      description: d.description.trim() || undefined,
      url: d.link,
      modes: ["rail"],
      activeFrom: new Date(Number(d.timestamp) * 1000),
    };
  });
}

export function departuresFromLiveboard(st: { id: string; name: string }, deps: LiveDep[]): Departure[] {
  return deps.map((d) => {
    const scheduledAt = new Date(Number(d.time) * 1000);
    const delay = Math.round(Number(d.delay) / 60);
    return {
      id: `${st.id}:${d.vehicle}:${d.time}`,
      stationId: st.id,
      stationName: st.name,
      direction: "departure" as const,
      mode: "rail" as const,
      service: d.vehicleinfo?.shortname ?? d.vehicle.replace("BE.NMBS.", ""),
      carrier: "SNCB/NMBS",
      counterpart: d.station,
      scheduledAt,
      estimatedAt: new Date(scheduledAt.getTime() + delay * 60_000),
      platform: d.platform && d.platform !== "?" ? d.platform : undefined,
      status: departureState({ cancelled: d.canceled === "1", delay, realtime: true }),
      delayMinutes: delay,
    };
  });
}

export const beSncbIrail: Connector = {
  meta: {
    id: "be-sncb-irail",
    name: "SNCB/NMBS Belgian rail (iRail)",
    operator: "SNCB/NMBS, via the iRail open data API",
    country: "be",
    region: "europe",
    modes: ["rail"],
    kind: "api",
    homepage: "https://www.belgiantrain.be/en/travel-info/real-time-info",
    endpoints: [`${BASE}/disturbances/`, `${BASE}/liveboard/`],
    license: "iRail API terms (open data, attribution required)",
    attribution: "Data by SNCB/NMBS via iRail (irail.be)",
    intervalMinutes: 2,
    lat: 50.8503,
    lon: 4.3517,
  },
  async fetch(ctx) {
    const [dist, ...boards] = await Promise.all([
      fetchJson<{ disturbance?: Disturbance[] }>(ctx, `${BASE}/disturbances/?format=json&lang=en`),
      ...STATIONS.map((s) =>
        fetchJson<{ departures?: { departure?: LiveDep[] } }>(ctx, `${BASE}/liveboard/?id=${s.id}&format=json&lang=en&arrdep=departure`),
      ),
    ]);
    const departures: Departure[] = [];
    const stations = STATIONS.map((s, i) => {
      const d = departuresFromLiveboard(s, boards[i].departures?.departure ?? []);
      departures.push(...d);
      return stationFromBoard({ stationId: s.id, name: s.name, mode: "rail", country: "be", lat: s.lat, lon: s.lon }, d);
    });
    return { alerts: alertsFromDisturbances(dist.disturbance ?? []), departures, stations };
  },
};
