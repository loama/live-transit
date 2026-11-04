import { XMLParser } from "fast-xml-parser";
import { fetchText } from "@/lib/http";
import type { Connector, Departure, Vehicle } from "@/lib/types";
import { delayMinutes, departureState, localToDate, stationFromBoard } from "./util";

const BASE = "https://api.irishrail.ie/realtime/realtime.asmx";
const TZ = "Europe/Dublin";

const STATIONS = [
  { code: "CNLLY", name: "Dublin Connolly", lat: 53.3534, lon: -6.2504 },
  { code: "HSTON", name: "Dublin Heuston", lat: 53.3464, lon: -6.2926 },
  { code: "PERSE", name: "Dublin Pearse", lat: 53.3434, lon: -6.2459 },
  { code: "CORK", name: "Cork Kent", lat: 51.9018, lon: -8.4582 },
  { code: "GALWY", name: "Galway Ceannt", lat: 53.2736, lon: -9.047 },
  { code: "LMRCK", name: "Limerick Colbert", lat: 52.6587, lon: -8.624 },
];

const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

const asArray = <T>(x: T | T[] | undefined | ""): T[] => (x == null || x === "" ? [] : Array.isArray(x) ? x : [x]);

interface TrainPos {
  TrainStatus: string;
  TrainLatitude: string;
  TrainLongitude: string;
  TrainCode: string;
  TrainDate: string;
  PublicMessage: string;
  Direction: string;
}
interface StationRow {
  Traincode: string;
  Stationcode: string;
  Querytime: string;
  Traindate: string;
  Origin: string;
  Destination: string;
  Status: string;
  Late: string;
  Exparrival: string;
  Expdepart: string;
  Scharrival: string;
  Schdepart: string;
  Traintype: string;
  Locationtype: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "04 Nov 2026" + "16:05" in Dublin time. A time more than 12h before the query time belongs to the next day. */
export function dublinTime(date: string, hhmm: string, queryHhmm: string): Date | undefined {
  const m = date.match(/^(\d{1,2}) (\w{3}) (\d{4})$/);
  const mi = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || mi < 0 || !/^\d{1,2}:\d{2}/.test(hhmm)) return undefined;
  const base = `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  let d = localToDate(`${base}T${hhmm.padStart(5, "0")}:00`, TZ);
  const q = localToDate(`${base}T${queryHhmm.slice(0, 5).padStart(5, "0")}:00`, TZ);
  if (q.getTime() - d.getTime() > 12 * 3600_000) d = new Date(d.getTime() + 24 * 3600_000);
  return d;
}

export function departuresFromRows(st: { code: string; name: string }, rows: StationRow[]): Departure[] {
  const out: Departure[] = [];
  for (const r of rows) {
    const arrival = r.Locationtype === "D";
    const sched = arrival ? r.Scharrival : r.Schdepart;
    const exp = arrival ? r.Exparrival : r.Expdepart;
    const scheduledAt = dublinTime(r.Traindate, sched, r.Querytime);
    if (!scheduledAt) continue;
    const estimatedAt = dublinTime(r.Traindate, exp, r.Querytime);
    const live = r.Status !== "No Information";
    const delay = live ? (r.Late ? Number(r.Late) : delayMinutes(scheduledAt, estimatedAt)) : undefined;
    const cancelled = /cancel/i.test(r.Status ?? "");
    out.push({
      id: `${st.code}:${r.Traincode.trim()}:${r.Traindate}:${arrival ? "arr" : "dep"}`,
      stationId: st.code,
      stationName: st.name,
      direction: arrival ? "arrival" : "departure",
      mode: "rail",
      service: `${r.Traintype} ${r.Traincode.trim()}`,
      carrier: "Irish Rail",
      counterpart: arrival ? r.Origin : r.Destination,
      scheduledAt,
      estimatedAt: live ? estimatedAt : undefined,
      status: departureState({ cancelled, delay, realtime: live }),
      statusText: r.Status || undefined,
      delayMinutes: delay,
    });
  }
  return out;
}

export const ieIrishRail: Connector = {
  meta: {
    id: "ie-irish-rail",
    name: "Irish Rail realtime",
    operator: "Iarnród Éireann (Irish Rail)",
    country: "ie",
    region: "europe",
    modes: ["rail"],
    kind: "api",
    homepage: "https://www.irishrail.ie/en-ie/train-timetables/live-train-running-information",
    endpoints: [`${BASE}/getCurrentTrainsXML`, `${BASE}/getStationDataByCodeXML`],
    attribution: "Iarnród Éireann / Irish Rail realtime API",
    intervalMinutes: 1,
    lat: 53.3498,
    lon: -6.2603,
  },
  async fetch(ctx) {
    const [trainsXml, ...boardsXml] = await Promise.all([
      fetchText(ctx, `${BASE}/getCurrentTrainsXML`),
      ...STATIONS.map((s) => fetchText(ctx, `${BASE}/getStationDataByCodeXML?StationCode=${s.code}`)),
    ]);
    const trains = asArray<TrainPos>(xml.parse(trainsXml).ArrayOfObjTrainPositions?.objTrainPositions);
    const vehicles: Vehicle[] = trains
      .filter((t) => t.TrainStatus === "R" && Number(t.TrainLatitude) !== 0)
      .map((t) => ({
        id: `${t.TrainDate}:${t.TrainCode.trim()}`,
        mode: "rail",
        routeName: t.Direction,
        tripId: t.TrainCode.trim(),
        headsign: t.Direction,
        lat: Number(t.TrainLatitude),
        lon: Number(t.TrainLongitude),
        label: t.TrainCode.trim(),
      }));
    const departures: Departure[] = [];
    const stations = STATIONS.map((s, i) => {
      const rows = asArray<StationRow>(xml.parse(boardsXml[i]).ArrayOfObjStationData?.objStationData);
      const d = departuresFromRows(s, rows);
      departures.push(...d);
      return stationFromBoard({ stationId: s.code, name: s.name, mode: "rail", country: "ie", lat: s.lat, lon: s.lon }, d);
    });
    return { vehicles, departures, stations };
  },
};
