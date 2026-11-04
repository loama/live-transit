import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus, Mode } from "@/lib/types";
import { shortHash, stripBom } from "./util";

const BASE = "https://traininfo.jr-central.co.jp/zairaisen/data";
const MASTER = `${BASE}/hp_senku_master_en.json`;
const STATUS = `${BASE}/trainInfo/json/unkou.json`;
const PAGE = "https://traininfo.jr-central.co.jp/zairaisen/index.html?lang=en";

interface Master {
  lst: {
    ryokakuSenkuCd: string;
    ryokakuSenkuMei: string;
    senkuKbn: string;
    ryokakuSenkuKaishiShuryoEki: string;
    ryokakuSenkuColorCdchi?: string;
  }[];
}
interface Named {
  lang?: string;
  name: string;
}
interface Event {
  imp_line: Named[];
  status: Named[];
}
interface Operation {
  check?: string;
  events?: Event[] | null;
}

/** Status names are Japanese text published by JR Central. */
export function jrCentralState(statusNames: string[], express: boolean): LineState {
  if (statusNames.some((n) => n.startsWith("運転見合わせ"))) return "suspended";
  if (express && statusNames.some((n) => n === "運休あり")) return "major";
  if (statusNames.some((n) => n.startsWith("遅れ／運休あり") || n === "遅れあり")) return "minor";
  return "good";
}

const isExpress = (kbn: string) => kbn === "3" || kbn === "4";
const isConventional = (kbn: string) => kbn === "1";

export function parseJrCentral(master: Master, op: Operation): { lines: LineStatus[]; alerts: Alert[] } {
  const events = op.check === "1" ? (op.events ?? []) : [];
  const lines: LineStatus[] = [];
  const alerts: Alert[] = [];
  for (const m of master.lst) {
    const express = isExpress(m.senkuKbn);
    if (!express && !isConventional(m.senkuKbn)) continue;
    const section = m.ryokakuSenkuKaishiShuryoEki;
    const names = new Set([m.ryokakuSenkuMei, section ? `${m.ryokakuSenkuMei}(${section})` : m.ryokakuSenkuMei]);
    const mine = events.filter((e) => e.imp_line.some((l) => l.lang === "en" && names.has(l.name)));
    const statusNames = mine.flatMap((e) => e.status.filter((s) => s.lang === "ja").map((s) => s.name));
    const state = jrCentralState(statusNames, express);
    const enStatus = mine.flatMap((e) => e.status.filter((s) => s.lang === "en").map((s) => s.name));
    const displayName = section ? `${m.ryokakuSenkuMei} (${section})` : m.ryokakuSenkuMei;
    const mode: Mode = "rail";
    lines.push({
      lineId: m.ryokakuSenkuCd,
      lineName: displayName,
      mode,
      color: m.ryokakuSenkuColorCdchi?.replace("#", "").slice(0, 6) || undefined,
      status: state,
      statusText: state === "good" ? "Normal operation" : enStatus.join(", ") || statusNames.join(", "),
    });
    if (state !== "good") {
      const text = enStatus.length ? enStatus.join(", ") : statusNames.join(", ");
      alerts.push({
        id: `${m.ryokakuSenkuCd}:${shortHash(statusNames.join("|"))}`,
        severity: state === "suspended" ? "severe" : state === "major" ? "major" : "minor",
        title: `${displayName}: ${text}`,
        url: PAGE,
        modes: [mode],
        routes: [displayName],
      });
    }
  }
  return { lines, alerts };
}

export const jpJrCentral: Connector = {
  meta: {
    id: "jp-tokai-jrcentral",
    name: "JR Central Conventional Line and Limited Express Status",
    operator: "Central Japan Railway Company (JR Central)",
    country: "jp",
    city: "Nagoya",
    region: "asia",
    modes: ["rail"],
    kind: "api",
    homepage: PAGE,
    endpoints: [MASTER, STATUS],
    attribution: "Central Japan Railway Company",
    intervalMinutes: 2,
    lat: 35.1709,
    lon: 136.8815,
  },
  async fetch(ctx) {
    const [master, op] = await Promise.all([
      fetchJson<Master>(ctx, MASTER).then((x) => x),
      ctx.fetch(STATUS).then(async (r) => JSON.parse(stripBom(await r.text())) as Operation),
    ]);
    if (!master.lst?.length) throw new Error("JR Central line master is empty");
    return parseJrCentral(master, op);
  },
};
