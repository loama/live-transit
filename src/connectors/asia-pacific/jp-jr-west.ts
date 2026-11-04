import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus, Severity } from "@/lib/types";
import { localDay } from "./util";

const URL = "https://trafficinfo.westjr.co.jp/api/v1/trafficinfo.json";
const PAGE = "https://trafficinfo.westjr.co.jp/";
const TZ = "Asia/Tokyo";

interface Section {
  conditionName?: string;
  startStation?: string;
  endStation?: string;
}
interface Version {
  title?: string;
  body?: string;
  updatedAt?: string;
  occurredAt?: string;
  effectLines?: { id: number; lineName: string; sections?: Section[] }[];
  links?: { title: string; url: string }[];
}
interface Detail {
  trafficId: number;
  conditionName?: string;
  cause?: string;
  publicationDate?: string;
  sections?: Section[];
  versionDetail?: Version[];
}
interface LineInfo {
  id: number;
  lineName: string;
  [detailKey: string]: unknown;
}
interface Place {
  id: number;
  conventionalLineTrafficInfos?: LineInfo[];
  shinkansenTrafficInfos?: LineInfo[];
  expressTrafficInfos?: LineInfo[];
  noEffectLineTrafficInfos?: Detail[];
}
interface Area {
  id: number;
  areaAnnouncements?: { id: number; startAt?: string; endAt?: string; versions?: Version[] }[];
  dailyData?: { date: string; placeTrafficInfos?: Place[] }[];
}
interface Feed {
  masterData: { areas: { id: number; name: string; places: { lines: { id: number; name: string }[] }[] }[] };
  areaTrafficInfos: Area[];
}

/** Condition names are Japanese text published by JR West: suspension, cancellation, delay, notice. */
export function conditionState(name: string | undefined): LineState {
  if (!name) return "good";
  if (name.includes("見合わせ")) return "suspended";
  if (name.includes("運休") || name.includes("取り止め") || name.includes("取りやめ")) return "major";
  if (name.includes("遅延") || name.includes("遅れ")) return "minor";
  return "good";
}

const severityOf = (s: LineState): Severity =>
  s === "suspended" ? "severe" : s === "major" ? "major" : s === "minor" ? "minor" : "info";

const RANK: Record<LineState, number> = { good: 0, unknown: 0, minor: 1, major: 2, suspended: 3, closed: 3 };

export function parseJrWest(feed: Feed, now: Date): { lines: LineStatus[]; alerts: Alert[] } {
  const today = localDay(now, TZ);
  const alerts = new Map<string, Alert>();
  const worst = new Map<number, { state: LineState; text: string }>();
  const suspendedAnnouncements: string[] = [];

  const addDetail = (d: Detail, info: LineInfo | undefined) => {
    const v = d.versionDetail?.[d.versionDetail.length - 1] ?? d.versionDetail?.[0];
    const title = v?.title;
    if (!title) return;
    const state = conditionState(d.conditionName);
    const lineName = info?.lineName ?? v?.effectLines?.[0]?.lineName;
    const id = String(d.trafficId);
    if (!alerts.has(id)) {
      const sections = d.sections ?? v?.effectLines?.flatMap((l) => l.sections ?? []) ?? [];
      alerts.set(id, {
        id,
        severity: severityOf(state),
        title,
        description: v?.body?.trim(),
        cause: d.cause,
        url: v?.links?.[0]?.url ?? PAGE,
        modes: ["rail"],
        routes: lineName ? [lineName] : undefined,
        stops: [...new Set(sections.flatMap((s) => [s.startStation, s.endStation]).filter(Boolean) as string[])],
        activeFrom: v?.occurredAt ? new Date(v.occurredAt) : d.publicationDate ? new Date(d.publicationDate) : undefined,
      });
    }
    if (info) {
      const cur = worst.get(info.id);
      if (!cur || RANK[state] > RANK[cur.state]) worst.set(info.id, { state, text: d.conditionName ?? "" });
    }
  };

  for (const area of feed.areaTrafficInfos) {
    for (const day of area.dailyData ?? []) {
      if (day.date < today) continue;
      for (const place of day.placeTrafficInfos ?? []) {
        for (const key of ["conventionalLineTrafficInfos", "shinkansenTrafficInfos", "expressTrafficInfos"] as const) {
          for (const info of place[key] ?? []) {
            const details = (info[`${key.replace("Infos", "InfoDetails")}`] as Detail[] | undefined) ?? [];
            for (const d of details) addDetail(d, day.date === today ? info : undefined);
          }
        }
        for (const d of place.noEffectLineTrafficInfos ?? []) addDetail(d, undefined);
      }
    }
    for (const a of area.areaAnnouncements ?? []) {
      const start = a.startAt ? new Date(a.startAt) : undefined;
      const end = a.endAt ? new Date(a.endAt) : undefined;
      if (start && start > now) continue;
      if (end && end < now) continue;
      const v = a.versions?.[a.versions.length - 1];
      if (!v?.title) continue;
      const state = conditionState(v.title);
      if (state === "suspended") suspendedAnnouncements.push(v.title);
      alerts.set(`announcement:${a.id}`, {
        id: `announcement:${a.id}`,
        severity: state === "suspended" ? "severe" : state === "good" ? "info" : "minor",
        title: v.title,
        description: v.body?.trim(),
        url: v.links?.[0]?.url ?? PAGE,
        modes: ["rail"],
        activeFrom: start,
        activeUntil: end,
      });
    }
  }

  const names = feed.masterData.areas.flatMap((ar) => ar.places.flatMap((p) => p.lines.map((l) => l.name)));
  const announcedSuspension = (name: string) =>
    names.filter((n) => n === name).length === 1 ? suspendedAnnouncements.find((t) => t.includes(name)) : undefined;

  const lines: LineStatus[] = [];
  for (const area of feed.masterData.areas) {
    if (area.id === 0) continue;
    for (const place of area.places) {
      for (const l of place.lines) {
        const ann = announcedSuspension(l.name);
        const w = worst.get(l.id) ?? (ann ? { state: "suspended" as LineState, text: ann } : undefined);
        lines.push({
          lineId: String(l.id),
          lineName: l.name,
          mode: "rail",
          status: w?.state ?? "good",
          statusText: w?.text || (w ? "" : "平常運転"),
        });
      }
    }
  }
  return { lines, alerts: [...alerts.values()] };
}

export const jpJrWest: Connector = {
  meta: {
    id: "jp-kansai-jrwest",
    name: "JR West Train Operation Information",
    operator: "West Japan Railway Company (JR West)",
    country: "jp",
    city: "Osaka",
    region: "asia",
    modes: ["rail"],
    kind: "api",
    homepage: PAGE,
    endpoints: [URL],
    attribution: "West Japan Railway Company",
    intervalMinutes: 2,
    lat: 34.6937,
    lon: 135.5023,
  },
  async fetch(ctx) {
    const feed = await fetchJson<Feed>(ctx, URL);
    if (!feed.masterData?.areas?.length) throw new Error("JR West feed missing master data");
    return parseJrWest(feed, ctx.now);
  },
};
