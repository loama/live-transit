import { fetchJson, fetchText } from "@/lib/http";
import type { Connector, Departure, Mode, StationStatus } from "@/lib/types";
import { parseLocal, stripBom } from "./util";

const TZ = "Asia/Hong_Kong";
const API = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
const STATIONS_CSV = "https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv";

/** One interchange or terminus per line, so every heavy rail line has a live board. */
const BOARDS: { line: string; sta: string; lineName: string }[] = [
  { line: "TWL", sta: "CEN", lineName: "Tsuen Wan Line" },
  { line: "KTL", sta: "MOK", lineName: "Kwun Tong Line" },
  { line: "ISL", sta: "ADM", lineName: "Island Line" },
  { line: "TKL", sta: "NOP", lineName: "Tseung Kwan O Line" },
  { line: "TCL", sta: "KOW", lineName: "Tung Chung Line" },
  { line: "AEL", sta: "HOK", lineName: "Airport Express" },
  { line: "EAL", sta: "HUH", lineName: "East Rail Line" },
  { line: "TML", sta: "DIH", lineName: "Tuen Ma Line" },
  { line: "SIL", sta: "SOH", lineName: "South Island Line" },
];

interface Train {
  seq: string;
  dest: string;
  plat: string;
  time: string;
  ttnt: string;
  valid: string;
}
interface ScheduleResponse {
  status: number;
  message?: string;
  isdelay?: string;
  data?: Record<string, { UP?: Train[]; DOWN?: Train[] }>;
}

export function parseStationNames(csv: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const row of stripBom(csv).split(/\r?\n/).slice(1)) {
    const cells = row.match(/("([^"]*)"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
    if (cells && cells[2] && cells[5]) names.set(cells[2], cells[5]);
  }
  return names;
}

export function departuresFor(
  board: { line: string; sta: string; lineName: string },
  res: ScheduleResponse,
  names: Map<string, string>,
): Departure[] {
  const entry = res.data?.[`${board.line}-${board.sta}`];
  if (!entry) return [];
  const mode: Mode = board.line === "AEL" ? "rail" : "metro";
  const out: Departure[] = [];
  for (const [dir, trains] of [["UP", entry.UP], ["DOWN", entry.DOWN]] as const) {
    for (const t of trains ?? []) {
      if (t.valid !== "Y") continue;
      const at = parseLocal(t.time, TZ);
      if (!at) continue;
      out.push({
        id: `${board.line}:${board.sta}:${dir}:${t.plat}:${t.dest}:${at.toISOString()}`,
        stationId: board.sta,
        stationName: names.get(board.sta) ?? board.sta,
        direction: "departure",
        mode,
        service: board.lineName,
        counterpart: names.get(t.dest) ?? t.dest,
        scheduledAt: at,
        estimatedAt: at,
        platform: t.plat,
        status: res.isdelay === "Y" ? "delayed" : "on_time",
        statusText: res.isdelay === "Y" ? "Delay reported on this line" : undefined,
      });
    }
  }
  return out;
}

export const hkMtrNextTrain: Connector = {
  meta: {
    id: "hk-hongkong-mtr-nexttrain",
    name: "MTR Next Train Boards",
    operator: "MTR Corporation",
    country: "hk",
    city: "Hong Kong",
    region: "asia",
    modes: ["metro", "rail"],
    kind: "api",
    homepage: "https://www.mtr.com.hk/en/customer/main/index.html",
    endpoints: [API, STATIONS_CSV],
    license: "DATA.GOV.HK terms of use",
    attribution: "MTR Next Train API via DATA.GOV.HK",
    intervalMinutes: 1,
    lat: 22.3193,
    lon: 114.1694,
  },
  async fetch(ctx) {
    const names = parseStationNames(await fetchText(ctx, STATIONS_CSV));
    const results = await Promise.all(
      BOARDS.map(async (b) => {
        const res = await fetchJson<ScheduleResponse>(ctx, `${API}?line=${b.line}&sta=${b.sta}&lang=EN`);
        return { b, res };
      }),
    );
    const departures: Departure[] = [];
    const stations: StationStatus[] = [];
    for (const { b, res } of results) {
      if (res.status !== 1) continue;
      departures.push(...departuresFor(b, res, names));
      stations.push({
        stationId: b.sta,
        name: names.get(b.sta) ?? b.sta,
        mode: b.line === "AEL" ? "rail" : "metro",
        city: "Hong Kong",
        country: "hk",
        status: res.isdelay === "Y" ? "delays" : "normal",
        statusText: res.isdelay === "Y" ? `Delay reported on ${b.lineName}` : "Normal",
      });
    }
    if (!stations.length) throw new Error("MTR next train API returned no usable boards");
    return { departures, stations };
  },
};
