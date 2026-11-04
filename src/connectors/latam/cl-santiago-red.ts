import { parse } from "node-html-parser";
import { fetchText } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus } from "@/lib/types";

const MONTHS: Record<string, number> = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };

/** "02 Nov 2026 - Hasta que terminen las obras" gives the start date; the text after the dash is kept as the description. */
export function parseRedDate(s: string): { from?: Date; note?: string } {
  const m = s.match(/^\s*(\d{1,2}) ([A-Za-zñÑ]{3}) (\d{4})\s*(?:-\s*(.*))?$/);
  if (!m) return { note: s.trim() || undefined };
  const month = MONTHS[m[2]!.toLowerCase()];
  const from = month == null ? undefined : new Date(Date.UTC(Number(m[3]), month, Number(m[1]), 12));
  return { from, note: m[4]?.trim() || undefined };
}

const clean = (s?: string) => s?.replace(/\s+/g, " ").trim() ?? "";

export function parseRed(html: string): { alerts: Alert[]; lines: LineStatus[] } {
  const root = parse(html);
  const alerts: Alert[] = [];
  const lines: LineStatus[] = [];
  for (const table of root.querySelectorAll("table")) {
    const heads = table.querySelectorAll("th").map((th) => clean(th.text));
    if (heads[0] === "Fecha") {
      for (const tr of table.querySelectorAll("tbody tr")) {
        const tds = tr.querySelectorAll("td");
        const href = tr.querySelector("a.ampliar-info")?.getAttribute("href");
        const title = clean(tr.querySelector("td.descripcion")?.text);
        if (!href || !title) continue;
        const id = href.replace(/\/+$/, "").split("/").pop()!;
        const { from, note } = parseRedDate(clean(tds[0]?.text));
        const routes = tr.querySelectorAll("td.recorrido a").map((a) => clean(a.text)).filter(Boolean);
        const direction = clean(tds[2]?.text);
        const communes = clean(tds[3]?.text);
        alerts.push({
          id,
          severity: "minor",
          effect: "DETOUR",
          title,
          description: [note, direction, communes && `Comunas: ${communes}`].filter(Boolean).join(". ") || undefined,
          url: href,
          modes: ["bus"],
          routes,
          activeFrom: from,
        });
      }
    } else if (heads[0] === "Línea") {
      for (const tr of table.querySelectorAll("tbody tr")) {
        const name = clean(tr.querySelector(".metrotren")?.text);
        if (!name) continue;
        const tds = tr.querySelectorAll("td");
        const statusText = clean(tds[1]?.text);
        const incident = clean(tds[2]?.text);
        const status: LineState = /sin alteraciones/i.test(statusText) ? "good" : "minor";
        lines.push({ lineId: "metrotren-nos", lineName: name, mode: "rail", status, statusText });
        if (status !== "good") {
          alerts.push({
            id: `metrotren-nos:${statusText}:${incident}`.slice(0, 120),
            severity: "minor",
            title: `${name}: ${statusText}`,
            description: incident || undefined,
            modes: ["rail"],
            routes: [name],
          });
        }
      }
    }
  }
  return { alerts, lines };
}

export const santiagoRed: Connector = {
  meta: {
    id: "cl-santiago-red-movilidad",
    name: "Red Movilidad, desvíos y alteraciones del sistema",
    operator: "Directorio de Transporte Público Metropolitano",
    country: "cl",
    city: "Santiago",
    region: "latam",
    modes: ["bus", "rail"],
    kind: "scrape",
    homepage: "https://www.red.cl/estado-del-servicio/",
    endpoints: ["https://www.red.cl/estado-del-servicio/"],
    attribution: "Red Movilidad, DTPM",
    intervalMinutes: 10,
    lat: -33.4489,
    lon: -70.6693,
  },
  async fetch(ctx) {
    const html = await fetchText(ctx, "https://www.red.cl/estado-del-servicio/");
    const r = parseRed(html);
    if (!r.alerts.length && !r.lines.length) throw new Error("red.cl estado-del-servicio returned no rows");
    return r;
  },
};
