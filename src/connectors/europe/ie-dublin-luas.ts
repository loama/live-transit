import { XMLParser } from "fast-xml-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, Departure, LineState, LineStatus } from "@/lib/types";
import { hashId, stationFromBoard } from "./util";

const BASE = "https://luasforecasts.rpa.ie/xml/get.ashx";

const STOPS = [
  { code: "ABB", name: "Abbey Street", line: "red", lat: 53.34859, lon: -6.25817 },
  { code: "HEU", name: "Heuston", line: "red", lat: 53.34665, lon: -6.29181 },
  { code: "TAL", name: "Tallaght", line: "red", lat: 53.28749, lon: -6.37459 },
  { code: "STS", name: "St. Stephen's Green", line: "green", lat: 53.33907, lon: -6.26133 },
  { code: "OGP", name: "O'Connell - GPO", line: "green", lat: 53.34885, lon: -6.25988 },
  { code: "SAN", name: "Sandyford", line: "green", lat: 53.2776, lon: -6.20468 },
];
const LINES = { red: { id: "red", name: "Luas Red Line", color: "E1251B" }, green: { id: "green", name: "Luas Green Line", color: "00A651" } };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
const asArray = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

interface Tram {
  dueMins: string;
  destination: string;
}
interface StopInfo {
  created: string;
  message?: string;
  direction?: { name: string; tram?: Tram | Tram[] } | { name: string; tram?: Tram | Tram[] }[];
}

export function lineStateFromMessage(message: string): LineState {
  if (/operating normally/i.test(message)) return "good";
  if (/suspend|no service|not operating|closed/i.test(message)) return "suspended";
  return "minor";
}

export function parseStop(xml: string): StopInfo | undefined {
  return parser.parse(xml).stopInfo as StopInfo | undefined;
}

export const ieDublinLuas: Connector = {
  meta: {
    id: "ie-dublin-luas",
    name: "Luas Dublin",
    operator: "Transdev for Transport Infrastructure Ireland (Luas)",
    country: "ie",
    city: "Dublin",
    region: "europe",
    modes: ["tram"],
    kind: "api",
    homepage: "https://luas.ie/service-updates/",
    endpoints: [`${BASE}?action=forecast&stop={code}&encrypt=false`],
    attribution: "Luas forecasting API, Transport Infrastructure Ireland",
    intervalMinutes: 1,
    lat: 53.3438,
    lon: -6.2546,
  },
  async fetch(ctx) {
    const infos = await Promise.all(
      STOPS.map(async (s) => parseStop(await fetchText(ctx, `${BASE}?action=forecast&stop=${s.code}&encrypt=false`))),
    );
    const departures: Departure[] = [];
    const lineMsg = new Map<string, string>();
    const stations = STOPS.map((s, i) => {
      const info = infos[i];
      const msg = info?.message?.trim();
      if (msg && (!lineMsg.has(s.line) || lineStateFromMessage(msg) !== "good")) lineMsg.set(s.line, msg);
      const board: Departure[] = [];
      for (const dir of asArray(info?.direction)) {
        for (const [n, t] of asArray(dir.tram).entries()) {
          const mins = t.dueMins === "DUE" ? 0 : Number(t.dueMins);
          if (!Number.isFinite(mins) || !t.destination || t.destination === "No trams forecast") continue;
          const at = new Date(ctx.now.getTime() + mins * 60_000);
          board.push({
            id: `${s.code}:${dir.name}:${t.destination}:${n}`,
            stationId: s.code,
            stationName: s.name,
            direction: "departure",
            mode: "tram",
            service: LINES[s.line as keyof typeof LINES].name,
            carrier: "Luas",
            counterpart: t.destination,
            scheduledAt: at,
            estimatedAt: at,
            status: "on_time",
            statusText: `${dir.name}, due in ${t.dueMins} min`,
          });
        }
      }
      departures.push(...board);
      const st = stationFromBoard({ stationId: s.code, name: s.name, mode: "tram", city: "Dublin", country: "ie", lat: s.lat, lon: s.lon }, board);
      if (msg && lineStateFromMessage(msg) !== "good") return { ...st, status: "delays" as const, statusText: msg };
      return st;
    });
    const lines: LineStatus[] = Object.values(LINES).map((l) => {
      const msg = lineMsg.get(l.id);
      return {
        lineId: l.id,
        lineName: l.name,
        mode: "tram",
        color: l.color,
        status: msg ? lineStateFromMessage(msg) : "unknown",
        statusText: msg ?? "No status published",
      };
    });
    const alerts: Alert[] = lines
      .filter((l) => l.status !== "good" && l.status !== "unknown")
      .map((l) => ({
        id: `${l.lineId}:${hashId(l.statusText)}`,
        severity: l.status === "suspended" ? "severe" : "minor",
        title: `${l.lineName}: ${l.statusText}`.slice(0, 500),
        url: "https://luas.ie/service-updates/",
        modes: ["tram"],
        routes: [l.lineName],
      }));
    return { lines, alerts, departures, stations };
  },
};
