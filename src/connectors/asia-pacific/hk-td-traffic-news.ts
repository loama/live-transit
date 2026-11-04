import { XMLParser } from "fast-xml-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, Mode } from "@/lib/types";
import { decodeEntities, zonedDate } from "./util";

const URL = "https://resource.data.one.gov.hk/td/en/specialtrafficnews.xml";

interface Message {
  msgID: string | number;
  CurrentStatus?: number | string;
  EngText?: string;
  EngShort?: string;
  ReferenceDate?: string;
}

/** "2026/11/4 下午 11:43:03" (AM/PM written in Chinese) in Hong Kong time. */
export function parseReferenceDate(text: string | undefined): Date | undefined {
  const m = text?.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(上午|下午)\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  let h = +m[5] % 12;
  if (m[4] === "下午") h += 12;
  return zonedDate("Asia/Hong_Kong", +m[1], +m[2], +m[3], h, +m[6], +m[7]);
}

export function modesOf(text: string): Mode[] {
  const modes: Mode[] = [];
  if (/\bferry|ferries\b/i.test(text)) modes.push("ferry");
  if (/\bbus|buses\b/i.test(text)) modes.push("bus");
  if (/\btram/i.test(text)) modes.push("tram");
  if (/\bMTR\b|\brailway\b/i.test(text)) modes.push("metro");
  return modes.length ? modes : ["other"];
}

export const hkTrafficNews: Connector = {
  meta: {
    id: "hk-hongkong-td-trafficnews",
    name: "Hong Kong Special Traffic and Transport News",
    operator: "Transport Department, Hong Kong SAR Government",
    country: "hk",
    city: "Hong Kong",
    region: "asia",
    modes: ["bus", "ferry", "tram", "other"],
    kind: "api",
    homepage: "https://www.td.gov.hk/en/home/index.html",
    endpoints: [URL],
    license: "DATA.GOV.HK terms of use",
    attribution: "Transport Department, HKSAR Government via DATA.GOV.HK",
    intervalMinutes: 2,
    lat: 22.3193,
    lon: 114.1694,
  },
  async fetch(ctx) {
    const xml = await fetchText(ctx, URL);
    const parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: false, removeNSPrefix: true }).parse(xml);
    const body = parsed.body;
    if (!body) throw new Error("unexpected special traffic news payload");
    const list: Message[] = body.message ? [body.message].flat() : [];
    const alerts: Alert[] = [];
    for (const m of list) {
      const text = decodeEntities(m.EngText ?? m.EngShort ?? "");
      if (!text) continue;
      alerts.push({
        id: String(m.msgID),
        severity: "info",
        title: decodeEntities(m.EngShort ?? text).slice(0, 160),
        description: text,
        url: "https://www.td.gov.hk/en/home/index.html",
        modes: modesOf(text),
        activeFrom: parseReferenceDate(m.ReferenceDate),
      });
    }
    return { alerts };
  },
};
