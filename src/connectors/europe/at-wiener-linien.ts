import { fetchJson } from "@/lib/http";
import type { Alert, Connector, Departure, LineStatus, Mode, Severity } from "@/lib/types";
import { delayMinutes, departureState, stationFromBoard } from "./util";

const BASE = "https://www.wienerlinien.at/ogd_realtime";

const STATIONS = [
  { code: "stephansplatz", name: "Stephansplatz", lat: 48.2081, lon: 16.3716, rbl: [4111, 4118, 4906, 4911] },
  { code: "karlsplatz", name: "Karlsplatz", lat: 48.2010, lon: 16.3690, rbl: [4109, 4120, 4202, 4213, 4416, 4421] },
  { code: "praterstern", name: "Praterstern", lat: 48.2185, lon: 16.3923, rbl: [4112, 4117, 4260, 4263] },
  { code: "westbahnhof", name: "Westbahnhof", lat: 48.1967, lon: 16.3377, rbl: [4610, 4619, 4920, 4921] },
  { code: "schwedenplatz", name: "Schwedenplatz", lat: 48.2117, lon: 16.3779, rbl: [4113, 4116, 4410, 4427] },
];
const UBAHN = ["U1", "U2", "U3", "U4", "U6"];

export function lineMode(line: string): Mode {
  if (/^U\d/.test(line)) return "metro";
  if (/^\d+[AB]$/.test(line) || /^N/.test(line)) return "bus";
  if (/^\d+$/.test(line)) return Number(line) <= 71 ? "tram" : "bus";
  if (line === "WLB" || line === "D" || line === "O") return "tram";
  return "other";
}

const TYPE_MODE: Record<string, Mode> = { ptMetro: "metro", ptTram: "tram", ptTramWLB: "tram", ptTrainS: "rail", ptBusCity: "bus", ptBusNight: "bus", ptBus: "bus", ptTramVRT: "tram" };

interface TrafficInfo {
  refTrafficInfoCategoryId: number;
  name: string;
  title: string;
  description?: string;
  time?: { start?: string; end?: string };
  relatedLines?: string[];
  attributes?: { station?: string };
}
interface Monitor {
  locationStop: { properties: { title: string; attributes: { rbl: number } } };
  lines: {
    name: string;
    towards: string;
    platform: string;
    departures: { departure: { departureTime: { timePlanned?: string; timeReal?: string }; vehicle?: { type?: string; towards?: string } }[] };
  }[];
}

export function alertsFromTrafficInfos(list: TrafficInfo[]): Alert[] {
  return list.map((t) => {
    const lines = [...new Set(t.relatedLines ?? [])];
    const cat = t.refTrafficInfoCategoryId;
    const severity: Severity = cat === 2 ? "major" : cat === 3 ? "minor" : "info";
    const modes = [...new Set(lines.map(lineMode))];
    return {
      id: t.name,
      severity,
      effect: cat === 1 ? "ACCESSIBILITY_ISSUE" : undefined,
      title: t.title.replace(/\s*\n\s*/g, ": ").trim(),
      description: t.description && t.description !== t.title ? t.description : undefined,
      url: "https://www.wienerlinien.at/betriebsinfo",
      modes: modes.length ? modes : ["other"],
      routes: lines,
      stops: t.attributes?.station ? [t.attributes.station] : undefined,
      activeFrom: t.time?.start ? new Date(t.time.start) : undefined,
      activeUntil: t.time?.end ? new Date(t.time.end) : undefined,
    };
  });
}

export const atWienerLinien: Connector = {
  meta: {
    id: "at-vienna-wiener-linien",
    name: "Wiener Linien",
    operator: "Wiener Linien",
    country: "at",
    city: "Vienna",
    region: "europe",
    modes: ["metro", "tram", "bus"],
    kind: "api",
    homepage: "https://www.wienerlinien.at/betriebsinfo",
    endpoints: [`${BASE}/trafficInfoList`, `${BASE}/monitor`],
    license: "CC BY 4.0",
    attribution: "Datenquelle: Stadt Wien / Wiener Linien, data.wien.gv.at, CC BY 4.0",
    intervalMinutes: 1,
    lat: 48.2082,
    lon: 16.3738,
  },
  async fetch(ctx) {
    const allRbl = STATIONS.flatMap((s) => s.rbl);
    const [info, mon] = await Promise.all([
      fetchJson<{ data: { trafficInfos: TrafficInfo[] } }>(ctx, `${BASE}/trafficInfoList`),
      fetchJson<{ data: { monitors: Monitor[] } }>(ctx, `${BASE}/monitor?${allRbl.map((r) => `rbl=${r}`).join("&")}`),
    ]);
    const alerts = alertsFromTrafficInfos(info.data.trafficInfos).filter(
      (a) => (!a.activeFrom || a.activeFrom <= ctx.now) && (!a.activeUntil || a.activeUntil >= ctx.now),
    );
    const disrupted = new Set(alerts.filter((a) => a.severity !== "info").flatMap((a) => a.routes ?? []));
    const lines: LineStatus[] = UBAHN.map((u) => ({
      lineId: u,
      lineName: u,
      mode: "metro",
      status: disrupted.has(u) ? "minor" : "good",
      statusText: disrupted.has(u) ? "Service information" : "No disruption reported",
    }));
    const byRbl = new Map(mon.data.monitors.map((m) => [m.locationStop.properties.attributes.rbl, m]));
    const departures: Departure[] = [];
    const stations = STATIONS.map((s) => {
      const board: Departure[] = [];
      for (const rbl of s.rbl) {
        const m = byRbl.get(rbl);
        if (!m) continue;
        for (const l of m.lines) {
          for (const d of l.departures.departure) {
            const planned = d.departureTime.timePlanned ?? d.departureTime.timeReal;
            if (!planned) continue;
            const scheduledAt = new Date(planned);
            const estimatedAt = d.departureTime.timeReal ? new Date(d.departureTime.timeReal) : undefined;
            const delay = delayMinutes(scheduledAt, estimatedAt);
            board.push({
              id: `${s.code}:${rbl}:${l.name}:${planned}`,
              stationId: s.code,
              stationName: s.name,
              direction: "departure",
              mode: (d.vehicle?.type && TYPE_MODE[d.vehicle.type]) || lineMode(l.name),
              service: l.name,
              carrier: "Wiener Linien",
              counterpart: d.vehicle?.towards?.trim() || l.towards.trim(),
              scheduledAt,
              estimatedAt,
              platform: l.platform || undefined,
              status: departureState({ delay, realtime: Boolean(estimatedAt) }),
              delayMinutes: delay,
            });
          }
        }
      }
      departures.push(...board);
      return stationFromBoard({ stationId: s.code, name: s.name, mode: "metro", city: "Vienna", country: "at", lat: s.lat, lon: s.lon }, board);
    });
    return { alerts, lines, departures, stations };
  },
};
