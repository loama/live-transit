import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus, Mode } from "@/lib/types";

// TfL statusSeverity codes: https://api.tfl.gov.uk/Line/Meta/Severity
export function tflState(severity: number): LineState {
  if (severity === 10 || severity === 18 || severity === 19) return "good";
  if (severity === 20 || severity === 16) return "closed";
  if (severity === 1 || severity === 2 || severity === 4 || severity === 11) return "suspended";
  if (severity === 3 || severity === 5 || severity === 6 || severity === 7 || severity === 8) return "major";
  if (severity === 9 || severity === 12 || severity === 13 || severity === 14 || severity === 15 || severity === 17) return "minor";
  return "unknown";
}

const MODE: Record<string, Mode> = { tube: "metro", dlr: "metro", "elizabeth-line": "rail", overground: "rail", tram: "tram" };
const COLORS: Record<string, string> = {
  bakerloo: "B36305", central: "E32017", circle: "FFD300", district: "00782A", "hammersmith-city": "F3A9BB",
  jubilee: "A0A5A9", metropolitan: "9B0056", northern: "000000", piccadilly: "003688", victoria: "0098D4",
  "waterloo-city": "95CDBA", dlr: "00A4A7", elizabeth: "6950A1", tram: "84B817", liberty: "5D6061",
  lioness: "FAA61A", mildmay: "006FE6", suffragette: "5BBD72", weaver: "823A62", windrush: "ED1B00",
};

interface TflLine {
  id: string;
  name: string;
  modeName: string;
  lineStatuses: { statusSeverity: number; statusSeverityDescription: string; reason?: string }[];
}

export const tfl: Connector = {
  meta: {
    id: "gb-london-tfl",
    name: "Transport for London",
    operator: "Transport for London",
    country: "gb",
    city: "London",
    region: "europe",
    modes: ["metro", "rail", "tram"],
    kind: "api",
    homepage: "https://tfl.gov.uk/tube-dlr-overground/status/",
    endpoints: ["https://api.tfl.gov.uk/Line/Mode/{modes}/Status"],
    license: "Powered by TfL Open Data",
    attribution: "Powered by TfL Open Data. Contains OS data © Crown copyright and database rights.",
    intervalMinutes: 1,
    lat: 51.5072,
    lon: -0.1276,
  },
  async fetch(ctx) {
    const data = await fetchJson<TflLine[]>(
      ctx,
      "https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr,elizabeth-line,tram/Status",
    );
    const lines: LineStatus[] = [];
    const alerts: Alert[] = [];
    for (const l of data) {
      const statuses = l.lineStatuses ?? [];
      const worst = statuses.reduce((a, b) => (b.statusSeverity < a.statusSeverity ? b : a), statuses[0]);
      if (!worst) continue;
      const mode = MODE[l.modeName] ?? "metro";
      lines.push({
        lineId: l.id,
        lineName: l.name,
        mode,
        color: COLORS[l.id],
        status: tflState(worst.statusSeverity),
        statusText: worst.statusSeverityDescription,
      });
      for (const s of statuses) {
        if (!s.reason) continue;
        const state = tflState(s.statusSeverity);
        alerts.push({
          id: `${l.id}:${s.statusSeverity}:${s.reason.slice(0, 60)}`,
          severity: state === "suspended" || state === "closed" ? "severe" : state === "major" ? "major" : "minor",
          title: `${l.name}: ${s.statusSeverityDescription}`,
          description: s.reason.trim(),
          url: "https://tfl.gov.uk/tube-dlr-overground/status/",
          modes: [mode],
          routes: [l.name],
        });
      }
    }
    return { lines, alerts };
  },
};
