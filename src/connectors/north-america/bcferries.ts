import { parse } from "node-html-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, Departure } from "@/lib/types";
import { zonedToUtc } from "./util";

const BASE = "https://www.bcferries.com/current-conditions";
const TZ = "America/Vancouver";
const ROUTES = ["TSA-SWB", "SWB-TSA", "TSA-DUK", "DUK-TSA", "HSB-NAN", "NAN-HSB", "HSB-LNG", "LNG-HSB"];

const clean = (s: string | undefined) => (s ?? "").replace(/ |&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** "7:09 am" -> minutes after midnight. */
function minutesOf(s: string): number | undefined {
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return undefined;
  return ((Number(m[1]) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0)) * 60 + Number(m[2]);
}

function localDay(now: Date, plusDays: number): [number, number, number] {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(new Date(now.getTime() + plusDays * 86_400_000))
      .map((x) => [x.type, Number(x.value)]),
  );
  return [p.year, p.month, p.day];
}

export function parseRoute(html: string, code: string, now: Date): { route: string; departures: Departure[]; notices: { code: string; title: string }[] } {
  const root = parse(html);
  const title = clean(root.querySelector("title")?.text).replace(/\s*Status \| BC Ferries$/, "");
  const [from, to] = title.split(" - ");
  if (!from || !to) throw new Error(`BC Ferries: unexpected page title for ${code}`);
  const departures: Departure[] = [];
  for (const tr of root.querySelectorAll("tr.mobile-friendly-row")) {
    const tds = tr.querySelectorAll("td");
    const left = tds[0];
    const spans = left?.querySelectorAll("p span") ?? [];
    const time = minutesOf(clean(spans[0]?.text));
    if (time === undefined) continue;
    const tomorrow = /tomorrow/i.test(clean(left.text));
    const [y, mo, d] = localDay(now, tomorrow ? 1 : 0);
    const scheduledAt = zonedToUtc(y, mo, d, Math.floor(time / 60), time % 60, TZ);
    const italic = clean(left.querySelector(".font-italic")?.text);
    const actual = italic ? minutesOf(italic.replace(/^Departed/i, "")) : undefined;
    const message = clean(tds[1]?.querySelector(".cc-message-updates")?.text);
    const space = clean(tds[1]?.text).match(/(\d+)%/)?.[1];
    const cancelled = /cancel/i.test(message);
    const departed = /departed/i.test(italic);
    const delayMin = actual !== undefined && departed ? Math.max(0, actual - time) : undefined;
    departures.push({
      id: `${code}:${scheduledAt.toISOString()}`,
      stationId: code.split("-")[0],
      stationName: from,
      direction: "departure",
      mode: "ferry",
      service: title,
      carrier: clean(left.querySelector(".sailing-ferry-name")?.text) || undefined,
      counterpart: to,
      scheduledAt,
      estimatedAt: actual !== undefined && departed ? new Date(scheduledAt.getTime() + (actual - time) * 60_000) : undefined,
      status: cancelled ? "cancelled" : /arrived/i.test(message) ? "arrived" : departed ? "departed" : "scheduled",
      statusText: [message, space ? `${space}% vehicle space available` : ""].filter(Boolean).join(", ") || undefined,
      delayMinutes: delayMin,
    });
  }
  const notices = root
    .querySelectorAll("a[href*='serviceNoticeCode=']")
    .map((a) => ({ code: a.getAttribute("href")!.match(/serviceNoticeCode=(\d+)/)![1], title: clean(a.text) }))
    .filter((n) => n.title);
  return { route: title, departures, notices };
}

export const bcFerries: Connector = {
  meta: {
    id: "ca-bc-bcferries",
    name: "BC Ferries Current Conditions",
    operator: "BC Ferries",
    country: "ca",
    city: "Vancouver",
    region: "north-america",
    modes: ["ferry"],
    kind: "scrape",
    homepage: "https://www.bcferries.com/current-conditions",
    endpoints: ROUTES.map((r) => `${BASE}/${r}`),
    attribution: "Current conditions published by BC Ferries.",
    intervalMinutes: 5,
    lat: 49.1,
    lon: -123.6,
  },
  async fetch(ctx) {
    const pages = await Promise.all(ROUTES.map((r) => fetchText(ctx, `${BASE}/${r}`)));
    const parsed = pages.map((h, i) => parseRoute(h, ROUTES[i], ctx.now));
    const departures = parsed.flatMap((p) => p.departures);
    const byCode = new Map<string, Alert>();
    parsed.forEach((p) => {
      for (const n of p.notices) {
        const existing = byCode.get(n.code);
        const route = p.route;
        if (existing) existing.routes!.push(route);
        else
          byCode.set(n.code, {
            id: n.code,
            severity: "info",
            title: n.title,
            url: `${BASE}/service-notices?serviceNoticeCode=${n.code}`,
            modes: ["ferry"],
            routes: [route],
          });
      }
    });
    return { departures, alerts: [...byCode.values()] };
  },
};
