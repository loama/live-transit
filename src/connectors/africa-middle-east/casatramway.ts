import { parse, type HTMLElement } from "node-html-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, Mode, Severity } from "@/lib/types";
import { cleanText } from "./util";

const BASE = "https://www.casatramway.ma";
const PAGE = `${BASE}/se-deplacer/infos-trafic-perturbation`;
const MAX_LINES = 8;
const MAX_DETAILS = 10;

export function effectFromLabel(label: string): { effect?: string; severity: Severity } {
  const l = label.toLowerCase();
  if (/interromp|pas de service|suspendu|arr[eê]t/.test(l)) return { effect: "NO_SERVICE", severity: "severe" };
  if (/retard/.test(l)) return { effect: "SIGNIFICANT_DELAYS", severity: "major" };
  if (/r[eé]duit|limit/.test(l)) return { effect: "REDUCED_SERVICE", severity: "major" };
  if (/d[eé]vi/.test(l)) return { effect: "DETOUR", severity: "minor" };
  if (/modifi|perturb/.test(l)) return { effect: "MODIFIED_SERVICE", severity: "minor" };
  return { severity: "minor" };
}

export interface AffectedLine {
  nid: string;
  name: string;
  mode: Mode;
}

export function parseAffectedLines(html: string): AffectedLine[] {
  const out: AffectedLine[] = [];
  for (const group of parse(html).querySelectorAll(".views-alerts-lignes")) {
    const title = cleanText(group.parentNode?.querySelector(".field--name")?.text).toLowerCase();
    const mode: Mode = title.includes("bus") ? "bus" : "tram";
    for (const b of group.querySelectorAll("[data-nid]")) {
      out.push({ nid: b.getAttribute("data-nid")!, name: cleanText(b.getAttribute("title") ?? b.text), mode });
    }
  }
  return out;
}

export interface LineAlertCard {
  path: string;
  title: string;
  effectLabel: string;
  startsAt?: Date;
  planned: boolean;
}

export function parseLineAlerts(html: string): LineAlertCard[] {
  const out: LineAlertCard[] = [];
  for (const section of parse(html).querySelectorAll(".views-alert-page")) {
    const planned = !section.classNames.includes("views-alert-page--ongoing");
    for (const card of section.querySelectorAll("article.card")) {
      const path = card.getAttribute("data-element-url");
      const title = cleanText(card.querySelector("h4")?.text);
      if (!path || !title) continue;
      const iso = card.querySelector("time[itemprop=startDate]")?.getAttribute("datetime");
      const t = iso ? new Date(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : undefined;
      out.push({
        path,
        title,
        effectLabel: cleanText(card.querySelector(".field--field-effect")?.text),
        startsAt: t && !Number.isNaN(t.getTime()) ? t : undefined,
        planned,
      });
    }
  }
  return out;
}

function detailText(html: string): string | undefined {
  const root: HTMLElement = parse(html);
  const body = root.querySelector("main .ck-content, main article .field--field-body, main .field--name-body");
  const txt = cleanText(body?.text);
  if (txt) return txt;
  const paras = root.querySelectorAll("main p").map((p) => cleanText(p.text)).filter((t) => t.length > 40);
  return paras[0];
}

export const casatramway: Connector = {
  meta: {
    id: "ma-casablanca-casatramway",
    name: "Casatramway & Casabusway traffic info",
    operator: "Casa Transport (Casatramway, Casabusway)",
    country: "ma",
    city: "Casablanca",
    region: "africa",
    modes: ["tram", "bus"],
    kind: "scrape",
    homepage: PAGE,
    endpoints: [PAGE],
    attribution: "Casa Transport",
    intervalMinutes: 5,
    lat: 33.5731,
    lon: -7.5898,
  },
  async fetch(ctx) {
    const lines = parseAffectedLines(await fetchText(ctx, PAGE)).slice(0, MAX_LINES);
    const byPath = new Map<string, { card: LineAlertCard; routes: Set<string>; modes: Set<Mode> }>();
    for (const line of lines) {
      const cards = parseLineAlerts(await fetchText(ctx, `${PAGE}?ligne_nid=${line.nid}`));
      for (const card of cards) {
        const e = byPath.get(card.path) ?? { card, routes: new Set<string>(), modes: new Set<Mode>() };
        e.routes.add(line.name);
        e.modes.add(line.mode);
        byPath.set(card.path, e);
      }
    }
    const alerts: Alert[] = [];
    let details = 0;
    for (const [path, { card, routes, modes }] of byPath) {
      const { effect, severity } = effectFromLabel(card.effectLabel);
      let description: string | undefined;
      if (details++ < MAX_DETAILS) {
        try {
          description = detailText(await fetchText(ctx, `${BASE}${path}`));
        } catch {
          description = undefined;
        }
      }
      alerts.push({
        id: path.split("/").pop()!,
        severity,
        effect,
        title: card.title,
        description: description ?? card.effectLabel,
        url: `${BASE}${path}`,
        modes: [...modes],
        routes: [...routes],
        activeFrom: card.startsAt,
      });
    }
    return { alerts };
  },
};
