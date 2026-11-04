import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus, Mode } from "@/lib/types";

interface RygLine {
  line_code: string;
  line_name: string;
  line_color?: string;
  status: string;
  messages?: string;
}
interface RygResponse {
  ryg_status: { line: RygLine[] };
}

export function mtrState(status: string): LineState {
  switch (status.toLowerCase()) {
    case "green":
      return "good";
    case "yellow":
    case "pink":
      return "minor";
    case "red":
      return "major";
    case "grey":
    case "gray":
      return "closed";
    default:
      return "unknown";
  }
}

const STATUS_TEXT: Record<string, string> = {
  green: "Normal service",
  yellow: "Minor delay or service adjustment",
  pink: "Special arrangement",
  red: "Serious delay or disruption",
  grey: "Service not in operation",
};

const lineMode = (code: string): Mode => (code === "LR" ? "tram" : code === "AEL" ? "rail" : "metro");

export const hkMtr: Connector = {
  meta: {
    id: "hk-hongkong-mtr",
    name: "MTR Hong Kong Line Status",
    operator: "MTR Corporation",
    country: "hk",
    city: "Hong Kong",
    region: "asia",
    modes: ["metro", "rail", "tram"],
    kind: "api",
    homepage: "https://www.mtr.com.hk/en/customer/main/index.html",
    endpoints: ["https://www.mtr.com.hk/alert/ryg_line_status.json"],
    attribution: "MTR Corporation Limited",
    intervalMinutes: 1,
    lat: 22.3193,
    lon: 114.1694,
  },
  async fetch(ctx) {
    const data = await fetchJson<RygResponse>(ctx, "https://www.mtr.com.hk/alert/ryg_line_status.json");
    const raw = data.ryg_status?.line ?? [];
    if (!raw.length) throw new Error("MTR line status feed returned no lines");
    const lines: LineStatus[] = [];
    const alerts: Alert[] = [];
    for (const l of raw) {
      const state = mtrState(l.status);
      const mode = lineMode(l.line_code);
      const message = l.messages?.replace(/\s+/g, " ").trim();
      lines.push({
        lineId: l.line_code,
        lineName: l.line_name,
        mode,
        color: l.line_color?.replace("#", ""),
        status: state,
        statusText: message || STATUS_TEXT[l.status.toLowerCase()] || l.status,
      });
      if (state !== "good" && state !== "unknown") {
        alerts.push({
          id: `${l.line_code}:${l.status.toLowerCase()}`,
          severity: state === "major" ? "major" : state === "closed" ? "severe" : "minor",
          title: `${l.line_name}: ${STATUS_TEXT[l.status.toLowerCase()] ?? l.status}`,
          description: message || undefined,
          url: "https://www.mtr.com.hk/en/customer/main/index.html",
          modes: [mode],
          routes: [l.line_name],
        });
      }
    }
    return { lines, alerts };
  },
};
