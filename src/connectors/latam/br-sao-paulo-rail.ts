import { parse } from "node-html-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus, Mode } from "@/lib/types";
import { norm, parseLocal, portugueseLineState, severityForState } from "./shared";

function alertFor(id: string, name: string, mode: Mode, status: LineState, text: string, detail?: string, activeFrom?: Date): Alert | undefined {
  if (status === "good") return undefined;
  return {
    id: `${id}:${norm(text)}`,
    severity: severityForState(status),
    effect: status === "suspended" || status === "closed" ? "NO_SERVICE" : "MODIFIED_SERVICE",
    title: `${name}: ${text}`,
    description: detail || undefined,
    modes: [mode],
    routes: [name],
    activeFrom,
  };
}

const SAO_PAULO_OFFSET = "-03:00";

/** "04/11/2026 13:00:40" or "04/11/2026 13:00" in America/Sao_Paulo (UTC-3, no DST since 2019). */
export function parseSaoPauloDate(s: string): Date | undefined {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  return parseLocal(m[3]!, m[2]!, m[1]!, m[4]!, m[5]!, m[6] ?? "00", SAO_PAULO_OFFSET);
}

export function parseDiretoMetro(html: string): { lines: LineStatus[]; alerts: Alert[] } {
  const root = parse(html);
  const lines: LineStatus[] = [];
  const alerts: Alert[] = [];
  for (const li of root.querySelectorAll("li.linha")) {
    const num = li.querySelector(".linha-numero");
    const name = li.querySelector(".linha-nome")?.text.trim();
    const text = li.querySelector(".linha-situacao")?.text.trim();
    if (!num || !name || !text) continue;
    const number = num.text.trim();
    const color = num.getAttribute("style")?.match(/#([0-9a-f]{6})/i)?.[1]?.toUpperCase();
    const tip = parse(li.querySelector(".linha-info")?.getAttribute("data-bs-title") ?? "");
    const operator = tip.querySelector(".title")?.text.trim();
    const detail = tip.querySelector(".description")?.text.trim();
    const when = parseSaoPauloDate(tip.querySelector(".date")?.text ?? "");
    const lineName = `Linha ${number}-${name}`;
    const status = portugueseLineState(text);
    lines.push({ lineId: number, lineName, mode: "metro", color, status, statusText: text });
    const a = alertFor(`direto:${number}`, lineName, "metro", status, text, detail && detail !== text ? detail : undefined, when);
    if (a) {
      if (operator && operator !== text) a.title = `${lineName} (${operator}): ${text}`;
      alerts.push(a);
    }
  }
  return { lines, alerts };
}

export const saoPauloMetro: Connector = {
  meta: {
    id: "br-sao-paulo-metro",
    name: "Direto do Metrô, São Paulo",
    operator: "Companhia do Metropolitano de São Paulo",
    country: "br",
    city: "São Paulo",
    region: "latam",
    modes: ["metro"],
    kind: "scrape",
    homepage: "https://www.metro.sp.gov.br/sua-viagem/direto-metro/",
    endpoints: ["https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php?embed=1"],
    attribution: "Companhia do Metropolitano de São Paulo",
    intervalMinutes: 2,
    lat: -23.5505,
    lon: -46.6333,
  },
  async fetch(ctx) {
    const html = await fetchText(ctx, "https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php?embed=1");
    const r = parseDiretoMetro(html);
    if (!r.lines.length) throw new Error("Direto do Metrô returned no lines");
    return r;
  },
};

// Lines 4 and 5 are already published by the Direto do Metrô page.
const ARTESP_SKIP = new Set(["4", "5"]);

export function parseArtesp(html: string): { lines: LineStatus[]; alerts: Alert[] } {
  const root = parse(html);
  const lines: LineStatus[] = [];
  const alerts: Alert[] = [];
  for (const h3 of root.querySelectorAll("h3")) {
    const label = h3.text.trim();
    const m = label.match(/^Linha (\d+)-(.+)$/);
    if (!m || ARTESP_SKIP.has(m[1]!)) continue;
    let card = h3.parentNode;
    while (card && !card.classNames.includes("rounded-xl")) card = card.parentNode;
    if (!card) continue;
    const box = card.querySelector(".bg-gray-50");
    const text = box?.querySelector("strong")?.nextSibling?.text.trim() || box?.text.replace(/^\s*Situação:/, "").trim().split("\n")[0]?.trim();
    if (!text) continue;
    const detail = box?.querySelector("div")?.text.trim() || undefined;
    const mode: Mode = m[1] === "6" ? "metro" : "rail";
    const status = portugueseLineState(text);
    lines.push({ lineId: m[1]!, lineName: label, mode, status, statusText: text });
    const a = alertFor(`artesp:${m[1]}`, label, mode, status, text, detail);
    if (a) alerts.push(a);
  }
  return { lines, alerts };
}

export const saoPauloArtesp: Connector = {
  meta: {
    id: "br-sao-paulo-artesp-rail",
    name: "ARTESP, status das linhas metroferroviárias de São Paulo",
    operator: "ARTESP",
    country: "br",
    city: "São Paulo",
    region: "latam",
    modes: ["metro", "rail"],
    kind: "scrape",
    homepage: "https://ccm.artesp.sp.gov.br/metroferroviario/status-linhas/",
    endpoints: ["https://ccm.artesp.sp.gov.br/metroferroviario/status-linhas/"],
    attribution: "ARTESP, Portal CCM",
    intervalMinutes: 5,
    lat: -23.5505,
    lon: -46.6333,
  },
  async fetch(ctx) {
    const html = await fetchText(ctx, "https://ccm.artesp.sp.gov.br/metroferroviario/status-linhas/");
    const r = parseArtesp(html);
    if (!r.lines.length) throw new Error("ARTESP status page returned no lines");
    return r;
  },
};
