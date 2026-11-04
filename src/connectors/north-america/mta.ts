import { fetchJson } from "@/lib/http";
import { gtfsRtConnector } from "@/lib/gtfs-rt";
import type { Alert, Connector, LineState, LineStatus, Severity, SourceMeta } from "@/lib/types";
import { cleanVehicles, worse } from "./util";

const BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds";
const feed = (name: string) => `${BASE}/${encodeURIComponent(name)}`;
const ATTRIBUTION = "Data provided by the Metropolitan Transportation Authority.";

interface MercuryAlert {
  id: string;
  alert?: {
    active_period?: { start?: number; end?: number }[];
    informed_entity?: { route_id?: string; stop_id?: string }[];
    header_text?: { translation?: { text: string; language: string }[] };
    description_text?: { translation?: { text: string; language: string }[] };
    "transit_realtime.mercury_alert"?: { alert_type?: string };
  };
}

const SUBWAY_COLORS: Record<string, string> = {
  "1": "EE352E", "2": "EE352E", "3": "EE352E", "4": "00933C", "5": "00933C", "6": "00933C", "7": "B933AD",
  A: "0039A6", C: "0039A6", E: "0039A6", B: "FF6319", D: "FF6319", F: "FF6319", M: "FF6319", G: "6CBE45",
  J: "996633", Z: "996633", L: "A7A9AC", N: "FCCC0A", Q: "FCCC0A", R: "FCCC0A", W: "FCCC0A",
  GS: "808183", FS: "808183", H: "808183", SI: "0039A6",
};
const SUBWAY_LINES = Object.keys(SUBWAY_COLORS);
const SUBWAY_NAMES: Record<string, string> = { GS: "42 St Shuttle", FS: "Franklin Av Shuttle", H: "Rockaway Park Shuttle", SI: "Staten Island Railway" };

/** Map MTA's alert_type to how it affects the line and how serious the alert is. */
export function mtaAlertType(type: string | undefined): { state?: LineState; severity: Severity } {
  switch (type) {
    case "Planned - Suspended":
    case "Suspended":
      return { state: "suspended", severity: "severe" };
    case "Reduced Service":
    case "Planned - Part Suspended":
      return { state: "major", severity: "major" };
    case "Delays":
    case "Expect Delays":
    case "Some Delays":
      return { state: "minor", severity: "minor" };
    case "Extra Service":
    case "Station Notice":
    case undefined:
      return { severity: "info" };
    default:
      return { state: "minor", severity: "minor" };
  }
}

const en = (t?: { translation?: { text: string; language: string }[] }) => t?.translation?.find((x) => x.language === "en")?.text.trim();

export function parseSubwayAlerts(entities: MercuryAlert[], now: Date): { alerts: Alert[]; lines: LineStatus[] } {
  const nowS = now.getTime() / 1000;
  const alerts: Alert[] = [];
  const state: Record<string, { s: LineState; text: string }> = {};
  for (const e of entities) {
    const a = e.alert;
    if (!a) continue;
    const periods = a.active_period ?? [];
    const cur = periods.find((p) => (p.start ?? 0) <= nowS && nowS <= (p.end ?? Infinity));
    if (periods.length && !cur) continue;
    const title = en(a.header_text);
    if (!title) continue;
    const type = a["transit_realtime.mercury_alert"]?.alert_type;
    const { state: ls, severity } = mtaAlertType(type);
    const routes = [...new Set((a.informed_entity ?? []).map((i) => i.route_id).filter(Boolean) as string[])];
    alerts.push({
      id: e.id,
      severity,
      effect: type,
      title: title.slice(0, 500),
      description: en(a.description_text)?.slice(0, 4000),
      modes: [routes.length && routes.every((r) => r === "SI") ? "rail" : "metro"],
      routes,
      stops: [...new Set((a.informed_entity ?? []).map((i) => i.stop_id).filter(Boolean) as string[])].slice(0, 50),
      activeFrom: cur?.start ? new Date(cur.start * 1000) : undefined,
      activeUntil: cur?.end ? new Date(cur.end * 1000) : undefined,
    });
    if (!ls) continue;
    for (const r of routes) {
      const prev = state[r]?.s ?? "good";
      if (worse(prev, ls) !== prev) state[r] = { s: ls, text: type ?? title };
    }
  }
  const lines = SUBWAY_LINES.map((id) => ({
    lineId: id,
    lineName: SUBWAY_NAMES[id] ?? id,
    mode: id === "SI" ? ("rail" as const) : ("metro" as const),
    color: SUBWAY_COLORS[id],
    status: state[id]?.s ?? "good",
    statusText: state[id]?.text ?? "Good service",
  }));
  return { alerts, lines };
}

export const mtaSubway: Connector = {
  meta: {
    id: "us-nyc-mta-subway",
    name: "MTA New York City Subway",
    operator: "Metropolitan Transportation Authority",
    country: "us",
    city: "New York",
    region: "north-america",
    modes: ["metro", "rail"],
    kind: "api",
    homepage: "https://www.mta.info/",
    endpoints: [feed("camsys/subway-alerts.json")],
    license: "MTA developer data terms",
    attribution: ATTRIBUTION,
    intervalMinutes: 1,
    lat: 40.7128,
    lon: -74.006,
  },
  async fetch(ctx) {
    const j = await fetchJson<{ entity: MercuryAlert[] }>(ctx, feed("camsys/subway-alerts.json"));
    return parseSubwayAlerts(j.entity ?? [], ctx.now);
  },
};

const mk = (id: string, name: string, modes: SourceMeta["modes"], homepage: string, lat: number, lon: number): SourceMeta => ({
  id,
  name,
  operator: "Metropolitan Transportation Authority",
  country: "us",
  city: "New York",
  region: "north-america",
  modes,
  kind: "gtfs-rt",
  homepage,
  endpoints: [],
  license: "MTA developer data terms",
  attribution: ATTRIBUTION,
  intervalMinutes: 1,
  lat,
  lon,
});

const busMeta = mk("us-nyc-mta-bus", "MTA New York City Bus", ["bus"], "https://www.mta.info/", 40.7128, -74.006);
busMeta.endpoints = [feed("camsys/bus-alerts")];
export const mtaBus = gtfsRtConnector(busMeta, { defaultMode: "bus", alerts: feed("camsys/bus-alerts") });

const lirrMeta = mk("us-nyc-mta-lirr", "MTA Long Island Rail Road", ["rail"], "https://www.mta.info/agency/long-island-rail-road", 40.7506, -73.9935);
lirrMeta.endpoints = [feed("camsys/lirr-alerts"), feed("lirr/gtfs-lirr")];
export const mtaLirr = cleanVehicles(gtfsRtConnector(lirrMeta, {
  defaultMode: "rail",
  routeNames: {
    "1": "Babylon Branch", "2": "Hempstead Branch", "3": "Oyster Bay Branch", "4": "Ronkonkoma Branch",
    "5": "Montauk Branch", "6": "Long Beach Branch", "7": "Far Rockaway Branch", "8": "West Hempstead Branch",
    "9": "Port Washington Branch", "10": "Port Jefferson Branch", "11": "Belmont Park", "12": "City Terminal Zone",
    "13": "Greenport Service",
  },
  alerts: feed("camsys/lirr-alerts"),
  vehicles: feed("lirr/gtfs-lirr"),
}));

const mnrMeta = mk("us-nyc-mta-metro-north", "MTA Metro-North Railroad", ["rail"], "https://www.mta.info/agency/metro-north-railroad", 40.7527, -73.9772);
mnrMeta.endpoints = [feed("camsys/mnr-alerts"), feed("mnr/gtfs-mnr")];
export const mtaMetroNorth = cleanVehicles(gtfsRtConnector(mnrMeta, {
  defaultMode: "rail",
  routeNames: { "1": "Hudson", "2": "Harlem", "3": "New Haven", "4": "New Canaan", "5": "Danbury", "6": "Waterbury" },
  alerts: feed("camsys/mnr-alerts"),
  vehicles: feed("mnr/gtfs-mnr"),
}));
