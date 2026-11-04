import { parse } from "node-html-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, Severity } from "@/lib/types";
import { cleanText, fixedOffsetDate, shortHash } from "./util";

const HOME = "https://www.gautrain.co.za/";
const SAST_OFFSET_MIN = 120;

export function gautrainSeverity(text: string): Severity {
  if (/suspend|no service|not (?:be )?(?:operat|running)|cancel/i.test(text)) return "major";
  if (/delay|disrupt|breakdown|incident|signal|power|technical|fault|reduced/i.test(text)) return "minor";
  return "info";
}

export function parseGautrainTicker(html: string): Alert[] {
  const root = parse(html);
  const ticker = root.querySelector("#ticker02");
  if (!ticker) throw new Error("gautrain: news ticker not found in page");
  const alerts: Alert[] = [];
  for (const li of ticker.querySelectorAll("li")) {
    const text = cleanText(li.querySelector(".tickerTapeMsg")?.text);
    if (!text) continue;
    const stamp = cleanText(li.querySelectorAll("span").find((s) => !s.classNames.includes("tickerTapeMsg"))?.text);
    const m = stamp.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    alerts.push({
      id: `ticker:${shortHash(text)}`,
      severity: gautrainSeverity(text),
      title: text.length > 90 ? `${text.slice(0, 87)}...` : text,
      description: text,
      url: HOME,
      modes: ["rail", "bus"],
      activeFrom: m ? fixedOffsetDate(+m[1], +m[2], +m[3], +m[4], +m[5], SAST_OFFSET_MIN) : undefined,
    });
  }
  return alerts;
}

export const gautrain: Connector = {
  meta: {
    id: "za-gauteng-gautrain",
    name: "Gautrain service notices",
    operator: "Gautrain Management Agency / Bombela Operating Company",
    country: "za",
    city: "Johannesburg",
    region: "africa",
    modes: ["rail", "bus"],
    kind: "scrape",
    homepage: "https://www.gautrain.co.za/",
    endpoints: ["https://www.gautrain.co.za/"],
    attribution: "Gautrain",
    intervalMinutes: 10,
    lat: -26.1,
    lon: 28.1,
  },
  async fetch(ctx) {
    const html = await fetchText(ctx, HOME);
    return { alerts: parseGautrainTicker(html) };
  },
};
