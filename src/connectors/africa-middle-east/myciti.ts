import { parse } from "node-html-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector } from "@/lib/types";
import { cleanText, fixedOffsetDate, shortHash } from "./util";

const HOME = "https://www.myciti.org.za/en/";
const PLANNED = "https://www.myciti.org.za/en/timetables/planned-service-disruptions/";
const SAST_OFFSET_MIN = 120;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = MONTHS.join("|");

/** Find the active window in free text: explicit "17 OCTOBER 2026" days, or "May - August 2026" month ranges. */
export function parseWindow(text: string): { from: Date; until: Date } | undefined {
  const days = [...text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})\\s+(\\d{4})\\b`, "gi"))];
  if (days.length) {
    const ds = days.map((m) => ({ y: +m[3], mo: MONTHS.indexOf(m[2].toLowerCase()) + 1, d: +m[1] }));
    const t = (x: (typeof ds)[number], h: number, mi: number) => fixedOffsetDate(x.y, x.mo, x.d, h, mi, SAST_OFFSET_MIN);
    const sorted = [...ds].sort((a, b) => t(a, 0, 0).getTime() - t(b, 0, 0).getTime());
    return { from: t(sorted[0], 0, 0), until: t(sorted[sorted.length - 1], 23, 59) };
  }
  const r = text.match(new RegExp(`\\b(${MONTH_RE})(?:\\s+(\\d{4}))?\\s*(?:-|to|\\u2013)\\s*(${MONTH_RE})\\s+(\\d{4})\\b`, "i"));
  if (r) {
    const endYear = +r[4];
    const m1 = MONTHS.indexOf(r[1].toLowerCase()) + 1;
    const m2 = MONTHS.indexOf(r[3].toLowerCase()) + 1;
    const startYear = r[2] ? +r[2] : m1 > m2 ? endYear - 1 : endYear;
    const lastDay = new Date(Date.UTC(endYear, m2, 0)).getUTCDate();
    return {
      from: fixedOffsetDate(startYear, m1, 1, 0, 0, SAST_OFFSET_MIN),
      until: fixedOffsetDate(endYear, m2, lastDay, 23, 59, SAST_OFFSET_MIN),
    };
  }
  return undefined;
}

export function parseServiceAlerts(html: string): Alert[] {
  const root = parse(html);
  const panel = root.querySelector("#nav-alerts");
  if (!panel) throw new Error("myciti: service alerts panel not found");
  const out: Alert[] = [];
  for (const a of panel.querySelectorAll(".alert-text")) {
    const text = cleanText(a.text);
    if (!text || /^no alerts available/i.test(text)) continue;
    out.push({
      id: `alert:${shortHash(text)}`,
      severity: "minor",
      title: text.length > 90 ? `${text.slice(0, 87)}...` : text,
      description: text,
      url: HOME,
      modes: ["bus"],
    });
  }
  return out;
}

export function parsePlannedDisruptions(html: string, now: Date): Alert[] {
  const root = parse(html);
  if (!root.querySelector("main")) throw new Error("myciti: planned disruptions page not found");
  const out: Alert[] = [];
  for (const section of root.querySelectorAll("main section")) {
    const title = cleanText(section.querySelector("h2")?.text);
    const body = section.querySelector("[data-control-type=control-simple-text]");
    if (!title || !body) continue;
    const text = cleanText(body.text);
    const win = parseWindow(text);
    if (win && win.until < now) continue;
    const routes = text.match(/Routes affected:\s*(.+?)(?:\s+(?:Time|Stops|Alternative|Impact|Tip|More Info|Dates)\b|$)/i)?.[1];
    out.push({
      id: `planned:${shortHash(title, text.slice(0, 200))}`,
      severity: "minor",
      effect: "MODIFIED_SERVICE",
      cause: /construction/i.test(title) ? "CONSTRUCTION" : undefined,
      title,
      description: text,
      url: PLANNED,
      modes: ["bus"],
      routes: routes?.split(/[,\s]+/).filter(Boolean),
      activeFrom: win?.from,
      activeUntil: win?.until,
    });
  }
  return out;
}

export const myciti: Connector = {
  meta: {
    id: "za-capetown-myciti",
    name: "MyCiTi service alerts",
    operator: "Transport Cape Town (City of Cape Town)",
    country: "za",
    city: "Cape Town",
    region: "africa",
    modes: ["bus"],
    kind: "scrape",
    homepage: "https://www.myciti.org.za/en/",
    endpoints: [HOME, PLANNED],
    attribution: "City of Cape Town, MyCiTi",
    intervalMinutes: 10,
    lat: -33.9249,
    lon: 18.4241,
  },
  async fetch(ctx) {
    const [home, planned] = await Promise.all([fetchText(ctx, HOME), fetchText(ctx, PLANNED)]);
    return { alerts: [...parseServiceAlerts(home), ...parsePlannedDisruptions(planned, ctx.now)] };
  },
};
