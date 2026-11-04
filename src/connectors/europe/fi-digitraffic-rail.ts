import { fetchJson } from "@/lib/http";
import type { Connector, Departure, Vehicle } from "@/lib/types";
import { delayMinutes, departureState, stationFromBoard } from "./util";

const BASE = "https://rata.digitraffic.fi/api/v1";
const HEADERS = { "Digitraffic-User": "LiveTransit/1.0 (livetransit.vercel.app)" };

const BOARDS = [
  { code: "HKI", name: "Helsinki", lat: 60.1719, lon: 24.9414 },
  { code: "TPE", name: "Tampere", lat: 61.4985, lon: 23.7737 },
  { code: "TKU", name: "Turku", lat: 60.4533, lon: 22.2534 },
  { code: "OL", name: "Oulu", lat: 65.0106, lon: 25.4837 },
];

interface Row {
  type: "ARRIVAL" | "DEPARTURE";
  stationShortCode: string;
  commercialStop?: boolean;
  commercialTrack?: string;
  cancelled: boolean;
  scheduledTime: string;
  actualTime?: string;
  liveEstimateTime?: string;
}
interface Train {
  trainNumber: number;
  departureDate: string;
  trainType: string;
  commuterLineID: string;
  operatorShortCode: string;
  cancelled: boolean;
  timeTableRows: Row[];
}
interface Loc {
  trainNumber: number;
  departureDate: string;
  location: { coordinates: [number, number] };
  speed: number;
  timestamp: string;
}
interface StationMeta {
  stationName: string;
  stationShortCode: string;
}

export function departuresForStation(trains: Train[], code: string, names: Map<string, string>, stationName: string): Departure[] {
  const out: Departure[] = [];
  const name = (c: string) => names.get(c) ?? c;
  for (const t of trains) {
    const rows = t.timeTableRows;
    const mine = rows.filter((r) => r.stationShortCode === code && r.commercialStop !== false);
    const row = mine.find((r) => r.type === "DEPARTURE") ?? mine.find((r) => r.type === "ARRIVAL");
    if (!row) continue;
    const departure = row.type === "DEPARTURE";
    const scheduledAt = new Date(row.scheduledTime);
    const estimatedAt = new Date(row.actualTime ?? row.liveEstimateTime ?? row.scheduledTime);
    const delay = delayMinutes(scheduledAt, estimatedAt);
    const cancelled = t.cancelled || row.cancelled;
    const service = t.commuterLineID ? `${t.commuterLineID}` : `${t.trainType} ${t.trainNumber}`;
    out.push({
      id: `${code}:${row.type}:${t.departureDate}:${t.trainNumber}`,
      stationId: code,
      stationName,
      direction: departure ? "departure" : "arrival",
      mode: "rail",
      service,
      carrier: t.operatorShortCode,
      counterpart: name(departure ? rows[rows.length - 1].stationShortCode : rows[0].stationShortCode),
      scheduledAt,
      estimatedAt,
      platform: row.commercialTrack || undefined,
      status: departureState({ cancelled, delay, realtime: Boolean(row.actualTime ?? row.liveEstimateTime) }),
      delayMinutes: delay,
    });
  }
  return out;
}

export const fiDigitrafficRail: Connector = {
  meta: {
    id: "fi-vr-digitraffic-rail",
    name: "Finnish Rail Traffic (Digitraffic)",
    operator: "Fintraffic",
    country: "fi",
    region: "europe",
    modes: ["rail"],
    kind: "api",
    homepage: "https://www.digitraffic.fi/en/railway-traffic/",
    endpoints: [`${BASE}/train-locations/latest/`, `${BASE}/live-trains/station/{code}`, `${BASE}/metadata/stations`],
    license: "CC BY 4.0",
    attribution: "Source: Fintraffic / digitraffic.fi, license CC 4.0 BY",
    intervalMinutes: 2,
    lat: 62.0,
    lon: 25.5,
  },
  async fetch(ctx) {
    const init = { headers: HEADERS };
    const q = "arrived_trains=3&arriving_trains=12&departed_trains=3&departing_trains=12&include_nonstopping=false";
    const [locs, meta, ...boards] = await Promise.all([
      fetchJson<Loc[]>(ctx, `${BASE}/train-locations/latest/`, init),
      fetchJson<StationMeta[]>(ctx, `${BASE}/metadata/stations`, init),
      ...BOARDS.map((b) => fetchJson<Train[]>(ctx, `${BASE}/live-trains/station/${b.code}?${q}`, init)),
    ]);
    const names = new Map(meta.map((s) => [s.stationShortCode, s.stationName]));
    const vehicles: Vehicle[] = locs.map((l) => ({
      id: `${l.departureDate}:${l.trainNumber}`,
      mode: "rail",
      routeName: String(l.trainNumber),
      tripId: `${l.departureDate}:${l.trainNumber}`,
      lon: l.location.coordinates[0],
      lat: l.location.coordinates[1],
      speed: l.speed / 3.6,
      observedAt: new Date(l.timestamp),
    }));
    const departures: Departure[] = [];
    const stations = BOARDS.map((b, i) => {
      const d = departuresForStation(boards[i], b.code, names, b.name);
      departures.push(...d);
      return stationFromBoard(
        { stationId: b.code, name: b.name, mode: "rail", city: b.name, country: "fi", lat: b.lat, lon: b.lon },
        d,
      );
    });
    return { vehicles, departures, stations, alerts: [] };
  },
};
