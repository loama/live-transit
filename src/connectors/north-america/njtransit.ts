import { XMLParser } from "fast-xml-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, Mode, Severity } from "@/lib/types";
import { asArray, parseMonthDateTime, stripHtml } from "./util";

const FEEDS: { url: string; mode: Mode; label: string }[] = [
  { url: "https://www.njtransit.com/rss/RailAdvisories_feed.xml", mode: "rail", label: "rail" },
  { url: "https://www.njtransit.com/rss/LightRailAdvisories_feed.xml", mode: "tram", label: "light rail" },
  { url: "https://www.njtransit.com/rss/BusAdvisories_feed.xml", mode: "bus", label: "bus" },
];

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

interface RssItem {
  title?: string;
  description?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
}

export function njtSeverity(text: string): Severity {
  if (/suspend|no (rail |train |bus )?service|cancel/i.test(text)) return "major";
  if (/buses replace|detour|delay|modified|reduced|closure|closed|bypass/i.test(text) && !/elevator|escalator|staircase/i.test(text)) return "minor";
  return "info";
}

export function njtRoutes(text: string, mode: Mode): { routes: string[]; stops: string[] } {
  if (mode === "bus") {
    const m = text.match(/(?:Route|Routes|Nos?\.?)\s+(?:No\.?s?\.?\s+)?([0-9A-Z][0-9A-Za-z ,&()-]*?)(?: in | \(|$)/);
    const nums = m ? m[1].split(/[,&]| and /).map((x) => x.trim()).filter((x) => /^\d/.test(x)) : [];
    return { routes: nums.map((n) => `Route ${n}`), stops: [] };
  }
  const head = text.split(":")[0];
  if (head === text || head.length > 50) return { routes: [], stops: [] };
  return /station|terminal|airport/i.test(head) ? { routes: [], stops: [head.trim()] } : { routes: [head.trim()], stops: [] };
}

export function parseNjtFeed(xml: string, mode: Mode): Alert[] {
  const items = asArray<RssItem>(parser.parse(xml)?.rss?.channel?.item);
  const seen = new Set<string>();
  const out: Alert[] = [];
  for (const it of items) {
    const text = stripHtml(it.description);
    const id = it.guid ?? it.link;
    if (!text || !id || seen.has(id)) continue;
    seen.add(id);
    const { routes, stops } = njtRoutes(text, mode);
    out.push({
      id: id.replace(/^https?:\/\/www\.njtransit\.com\//, ""),
      severity: njtSeverity(text),
      title: text.slice(0, 500),
      url: it.link,
      modes: [mode],
      routes,
      stops,
      activeFrom: it.pubDate ? parseMonthDateTime(it.pubDate, "America/New_York") : undefined,
    });
  }
  return out;
}

export const njTransit: Connector = {
  meta: {
    id: "us-nj-njtransit",
    name: "NJ TRANSIT Advisories",
    operator: "New Jersey Transit",
    country: "us",
    city: "Newark",
    region: "north-america",
    modes: ["rail", "tram", "bus"],
    kind: "api",
    homepage: "https://www.njtransit.com/service-advisories",
    endpoints: FEEDS.map((f) => f.url),
    attribution: "Advisories published by NJ TRANSIT.",
    intervalMinutes: 5,
    lat: 40.7342,
    lon: -74.1644,
  },
  async fetch(ctx) {
    const xmls = await Promise.all(FEEDS.map((f) => fetchText(ctx, f.url)));
    return { alerts: xmls.flatMap((x, i) => parseNjtFeed(x, FEEDS[i].mode)) };
  },
};
