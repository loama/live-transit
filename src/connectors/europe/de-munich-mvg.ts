import { fetchJson } from "@/lib/http";
import type { Alert, Connector, Departure, Mode } from "@/lib/types";
import { departureState, hashId, stationFromBoard, stripHtml } from "./util";

const BASE = "https://www.mvg.de/api/bgw-pt/v3";

const STATIONS = [
  { id: "de:09162:100", name: "München Hbf", mode: "rail" as Mode, lat: 48.1402, lon: 11.5602 },
  { id: "de:09162:2", name: "Marienplatz", mode: "metro" as Mode, lat: 48.1374, lon: 11.5755 },
  { id: "de:09162:5", name: "München Ost", mode: "metro" as Mode, lat: 48.1274, lon: 11.6044 },
  { id: "de:09162:1", name: "Karlsplatz (Stachus)", mode: "metro" as Mode, lat: 48.1393, lon: 11.5655 },
  { id: "de:09162:50", name: "Sendlinger Tor", mode: "metro" as Mode, lat: 48.1332, lon: 11.5668 },
];

const MODE: Record<string, Mode> = {
  UBAHN: "metro", SBAHN: "rail", BAHN: "rail", TRAM: "tram", BUS: "bus", REGIONAL_BUS: "bus", SCHIFF: "ferry",
};

interface Message {
  title: string;
  description: string;
  validFrom: number;
  validTo?: number;
  type: "INCIDENT" | "SCHEDULE_CHANGE" | string;
  links?: { url: string }[];
  lines: { label: string; transportType: string }[];
}
interface Dep {
  plannedDepartureTime: number;
  realtimeDepartureTime: number;
  realtime: boolean;
  delayInMinutes?: number;
  transportType: string;
  label: string;
  destination: string;
  cancelled: boolean;
  platform?: number | string;
  network?: string;
  tripCode?: number;
}

const SEVERE = /\b(Zugausfälle|Teilausfälle|Totalausfall|unterbrochen|gesperrt|Sperrung|Streik|kein Zugverkehr)/i;

export function alertsFromMessages(list: Message[]): Alert[] {
  return list.map((m) => {
    const routes = [...new Set(m.lines.map((l) => l.label))];
    const modes = [...new Set(m.lines.map((l) => MODE[l.transportType] ?? "other"))] as Mode[];
    const severity = m.type === "INCIDENT" ? (SEVERE.test(`${m.title} ${m.description}`) ? "major" : "minor") : "info";
    return {
      id: hashId(`${m.type}|${m.title}|${m.validFrom}|${m.description}|${routes.join(",")}`),
      severity,
      effect: m.type === "SCHEDULE_CHANGE" ? "MODIFIED_SERVICE" : undefined,
      title: m.title.slice(0, 500),
      description: stripHtml(m.description).slice(0, 4000) || undefined,
      url: m.links?.[0]?.url ?? "https://www.mvg.de/meldungen",
      modes: modes.length ? modes : ["other"],
      routes: routes.slice(0, 50),
      activeFrom: new Date(m.validFrom),
      activeUntil: m.validTo ? new Date(m.validTo) : undefined,
    };
  });
}

export function departuresFromMvg(st: { id: string; name: string }, deps: Dep[]): Departure[] {
  return deps.map((d) => {
    const scheduledAt = new Date(d.plannedDepartureTime);
    return {
      id: `${st.id}:${d.network ?? ""}:${d.label}:${d.tripCode ?? ""}:${d.plannedDepartureTime}`,
      stationId: st.id,
      stationName: st.name,
      direction: "departure" as const,
      mode: MODE[d.transportType] ?? "other",
      service: d.label,
      carrier: d.network === "ddb" ? "DB" : "MVG",
      counterpart: d.destination,
      scheduledAt,
      estimatedAt: d.realtime ? new Date(d.realtimeDepartureTime) : undefined,
      platform: d.platform != null ? String(d.platform) : undefined,
      status: departureState({ cancelled: d.cancelled, delay: d.delayInMinutes, realtime: d.realtime }),
      delayMinutes: d.realtime ? (d.delayInMinutes ?? 0) : undefined,
    };
  });
}

export const deMunichMvg: Connector = {
  meta: {
    id: "de-munich-mvg",
    name: "MVG Munich",
    operator: "Münchner Verkehrsgesellschaft (MVG)",
    country: "de",
    city: "Munich",
    region: "europe",
    modes: ["metro", "rail", "tram", "bus"],
    kind: "api",
    homepage: "https://www.mvg.de/meldungen",
    endpoints: [`${BASE}/messages`, `${BASE}/departures`],
    intervalMinutes: 2,
    lat: 48.1374,
    lon: 11.5755,
  },
  async fetch(ctx) {
    const [msgs, ...boards] = await Promise.all([
      fetchJson<Message[]>(ctx, `${BASE}/messages`),
      ...STATIONS.map((s) => fetchJson<Dep[]>(ctx, `${BASE}/departures?globalId=${encodeURIComponent(s.id)}&limit=30`)),
    ]);
    const now = ctx.now.getTime();
    const alerts = alertsFromMessages(msgs).filter(
      (a) => (a.activeFrom?.getTime() ?? 0) <= now && (a.activeUntil?.getTime() ?? Infinity) >= now,
    );
    const departures: Departure[] = [];
    const stations = STATIONS.map((s, i) => {
      const d = departuresFromMvg(s, boards[i]);
      departures.push(...d);
      return stationFromBoard({ stationId: s.id, name: s.name, mode: s.mode, city: "Munich", country: "de", lat: s.lat, lon: s.lon }, d);
    });
    return { alerts, departures, stations };
  },
};
