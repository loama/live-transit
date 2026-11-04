import { parse } from "node-html-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus } from "@/lib/types";
import { hash } from "./util";

const URL = "https://www.stm.info/en/service-status";

const COLORS: Record<string, string> = { "1": "008E4F", "2": "E87200", "4": "FFE000", "5": "0085CA" };
const NAMES: Record<string, string> = { "1": "Green", "2": "Orange", "4": "Yellow", "5": "Blue" };

export function stmState(message: string): LineState {
  if (/^normal/i.test(message)) return "good";
  if (/interrupt|no service|closed|stopped|suspend/i.test(message)) return "suspended";
  return "minor";
}

export function parseStm(html: string): { lines: LineStatus[]; alerts: Alert[] } {
  const root = parse(html);
  const items = root.querySelectorAll("#metro-service-status-content > li");
  if (!items.length) throw new Error("STM service status markup not found");
  const lines = new Map<string, LineStatus>();
  const alerts: Alert[] = [];
  for (const li of items) {
    const message = li.querySelector("p")?.text.replace(/\s+/g, " ").trim() ?? "";
    const ids = li
      .querySelectorAll("img")
      .map((i) => i.getAttribute("alt")?.match(/Line (\d)/)?.[1])
      .filter((x): x is string => !!x);
    if (!message || !ids.length) continue;
    const status = stmState(message);
    for (const id of ids)
      lines.set(id, { lineId: id, lineName: `Line ${id} ${NAMES[id] ?? ""}`.trim(), mode: "metro", color: COLORS[id], status, statusText: message });
    if (status !== "good")
      alerts.push({
        id: `metro:${ids.join("")}:${hash(message)}`,
        severity: status === "suspended" ? "severe" : "minor",
        title: message.slice(0, 300),
        url: URL,
        modes: ["metro"],
        routes: ids.map((id) => `Line ${id} ${NAMES[id] ?? ""}`.trim()),
      });
  }
  return { lines: [...lines.values()], alerts };
}

export const stm: Connector = {
  meta: {
    id: "ca-montreal-stm-metro",
    name: "STM Montréal Métro",
    operator: "Société de transport de Montréal",
    country: "ca",
    city: "Montréal",
    region: "north-america",
    modes: ["metro"],
    kind: "scrape",
    homepage: URL,
    endpoints: [URL],
    attribution: "Service status published by the STM.",
    intervalMinutes: 2,
    lat: 45.5017,
    lon: -73.5673,
  },
  async fetch(ctx) {
    return parseStm(await fetchText(ctx, URL));
  },
};
