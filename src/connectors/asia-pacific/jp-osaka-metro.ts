import { parse } from "node-html-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus, Mode } from "@/lib/types";

const PAGE = "https://www.osakametro.co.jp/en/";
const INFO = "https://subway.osakametro.co.jp/en/guide/subway_information.php";

/** Osaka Metro publishes status as an icon: icon_operation_normal, _delay or _stop. */
export function osakaIconState(src: string): LineState {
  const name = src.match(/icon_operation_([a-z]+)/)?.[1];
  if (name === "normal") return "good";
  if (name === "delay") return "minor";
  if (name === "stop") return "suspended";
  return "unknown";
}

export function parseOsakaMetro(html: string): { lines: LineStatus[]; alerts: Alert[] } {
  const root = parse(html);
  const lines: LineStatus[] = [];
  const alerts: Alert[] = [];
  for (const dd of root.querySelectorAll(".operationStatusArea dd")) {
    const icon = dd.querySelector(".cs-imagesSubway");
    const nameImg = dd.querySelector(".cs-lineNameImg");
    const name = nameImg?.getAttribute("alt")?.trim();
    const src = icon?.getAttribute("src") ?? "";
    if (!name || !icon) continue;
    const state = osakaIconState(src);
    const id = nameImg?.getAttribute("src")?.match(/img_top_([a-z0-9]+)_en/)?.[1] ?? name.toLowerCase().replace(/\W+/g, "-");
    const mode: Mode = /BRT/.test(name) ? "bus" : "metro";
    const text = icon.getAttribute("alt")?.trim() || "";
    lines.push({ lineId: id, lineName: name, mode, status: state, statusText: text });
    if (state !== "good" && state !== "unknown") {
      alerts.push({
        id: `${id}:${state}`,
        severity: state === "suspended" ? "severe" : "minor",
        title: `${name}: ${text}`,
        url: INFO,
        modes: [mode],
        routes: [name],
      });
    }
  }
  return { lines, alerts };
}

export const jpOsakaMetro: Connector = {
  meta: {
    id: "jp-osaka-osakametro",
    name: "Osaka Metro Service Status",
    operator: "Osaka Metro Co., Ltd.",
    country: "jp",
    city: "Osaka",
    region: "asia",
    modes: ["metro", "bus"],
    kind: "scrape",
    homepage: INFO,
    endpoints: [PAGE],
    attribution: "Osaka Metro Co., Ltd.",
    intervalMinutes: 2,
    lat: 34.6937,
    lon: 135.5023,
  },
  async fetch(ctx) {
    const r = parseOsakaMetro(await fetchText(ctx, PAGE));
    if (!r.lines.length) throw new Error("Osaka Metro status block not found");
    return r;
  },
};
