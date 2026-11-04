import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineState, Mode, Severity } from "@/lib/types";
import { asArray, parseLocalIso, stripHtml } from "./util";

const ALERTS = "https://www.transitchicago.com/api/1.0/alerts.aspx?outputType=JSON&activeonly=true";
const ROUTES = "https://www.transitchicago.com/api/1.0/routes.aspx?outputType=JSON";
const RAIL = new Set(["Red", "Blue", "Brn", "G", "Org", "Pink", "P", "Y"]);

type Cdata = string | { "#cdata-section"?: string } | null | undefined;
const text = (c: Cdata) => (typeof c === "string" ? c : (c?.["#cdata-section"] ?? ""));

interface CtaService {
  ServiceType: string;
  ServiceName: string;
  ServiceId: string;
}
interface CtaAlert {
  AlertId: string;
  Headline: string;
  ShortDescription: string;
  FullDescription: Cdata;
  SeverityCSS: string;
  Impact: string;
  EventStart: string | null;
  EventEnd: string | null;
  MajorAlert: string;
  AlertURL: Cdata;
  ImpactedService?: { Service: CtaService | CtaService[] };
}
interface CtaRoute {
  Route: string;
  RouteColorCode: string;
  ServiceId: string;
  RouteStatus: string;
}

export function ctaState(status: string): LineState {
  const s = status.toLowerCase();
  if (/normal|note|elevator/.test(s)) return "good";
  if (/no service|suspend|shut/.test(s)) return "suspended";
  if (/significant|major|part closure|partial/.test(s)) return "major";
  return "minor";
}

export function ctaSeverity(a: Pick<CtaAlert, "MajorAlert" | "Impact" | "SeverityCSS">): Severity {
  if (a.MajorAlert === "1") return "major";
  if (/delay|closure|suspend|no service/i.test(a.Impact)) return "minor";
  if (a.SeverityCSS === "planned") return "minor";
  return "info";
}

const modeOf = (s: CtaService): Mode => (s.ServiceType === "R" ? "metro" : "bus");

/** Alerts whose event window has not opened yet are not current. */
export function isFuture(a: { EventStart?: string | null }, now: Date): boolean {
  const start = parseLocalIso(a.EventStart, "America/Chicago");
  return !!start && start.getTime() > now.getTime();
}

export const cta: Connector = {
  meta: {
    id: "us-chicago-cta",
    name: "Chicago Transit Authority",
    operator: "Chicago Transit Authority",
    country: "us",
    city: "Chicago",
    region: "north-america",
    modes: ["metro", "bus"],
    kind: "api",
    homepage: "https://www.transitchicago.com/alerts/",
    endpoints: [ALERTS, ROUTES],
    license: "CTA developer terms of use",
    attribution: "Data provided by the Chicago Transit Authority.",
    intervalMinutes: 1,
    lat: 41.8781,
    lon: -87.6298,
  },
  async fetch(ctx) {
    const [al, ro] = await Promise.all([
      fetchJson<{ CTAAlerts: { Alert?: CtaAlert | CtaAlert[] } }>(ctx, ALERTS),
      fetchJson<{ CTARoutes: { RouteInfo: CtaRoute[] } }>(ctx, ROUTES),
    ]);
    const alerts: Alert[] = asArray(al.CTAAlerts.Alert).filter((a) => !isFuture(a, ctx.now)).map((a) => {
      const services = asArray(a.ImpactedService?.Service);
      const modes = [...new Set(services.map(modeOf))];
      return {
        id: a.AlertId,
        severity: ctaSeverity(a),
        effect: a.Impact || undefined,
        title: a.Headline,
        description: stripHtml(text(a.FullDescription)) || a.ShortDescription,
        url: text(a.AlertURL) || undefined,
        modes: modes.length ? modes : ["metro"],
        routes: services.map((s) => (s.ServiceType === "R" ? s.ServiceName : `${s.ServiceId} ${s.ServiceName}`)),
        activeFrom: parseLocalIso(a.EventStart, "America/Chicago"),
        activeUntil: parseLocalIso(a.EventEnd, "America/Chicago"),
      };
    });
    const lines = ro.CTARoutes.RouteInfo.map((r) => ({
      lineId: r.ServiceId,
      lineName: RAIL.has(r.ServiceId) ? r.Route : `${r.ServiceId} ${r.Route}`,
      mode: (RAIL.has(r.ServiceId) ? "metro" : "bus") as Mode,
      color: r.RouteColorCode || undefined,
      status: ctaState(r.RouteStatus),
      statusText: r.RouteStatus,
    }));
    return { alerts, lines };
  },
};
