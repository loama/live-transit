import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { fetchBuffer } from "./http";
import type { Alert, Connector, ConnectorContext, IngestResult, Mode, Severity, SourceMeta, Vehicle } from "./types";

const rt = GtfsRealtimeBindings.transit_realtime;
type FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;
type TranslatedString = GtfsRealtimeBindings.transit_realtime.ITranslatedString | null | undefined;

export function decodeFeed(buf: Uint8Array): FeedMessage {
  return rt.FeedMessage.decode(buf);
}

/** Pick English when available, otherwise the first translation. Strips HTML tags. */
export function pickText(t: TranslatedString, prefer = ["en", "en-US", "en-GB"]): string | undefined {
  const tr = t?.translation ?? [];
  if (!tr.length) return undefined;
  const hit = tr.find((x) => x.language && prefer.includes(x.language)) ?? tr.find((x) => !x.language) ?? tr[0];
  const text = hit?.text?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

const EFFECTS = rt.Alert.Effect;
const CAUSES = rt.Alert.Cause;

function effectName(n: number | null | undefined): string | undefined {
  if (n == null) return undefined;
  return (EFFECTS as unknown as Record<number, string>)[n];
}
function causeName(n: number | null | undefined): string | undefined {
  if (n == null) return undefined;
  const c = (CAUSES as unknown as Record<number, string>)[n];
  return c === "UNKNOWN_CAUSE" ? undefined : c;
}

export function severityFromEffect(effect?: string, severityLevel?: number | null): Severity {
  // GTFS-RT severity_level: 1 UNKNOWN, 2 INFO, 3 WARNING, 4 SEVERE
  if (severityLevel === 4) return "severe";
  switch (effect) {
    case "NO_SERVICE":
      return "severe";
    case "REDUCED_SERVICE":
    case "SIGNIFICANT_DELAYS":
    case "STOP_MOVED":
      return "major";
    case "DETOUR":
    case "MODIFIED_SERVICE":
    case "ACCESSIBILITY_ISSUE":
    case "ADDITIONAL_SERVICE":
      return "minor";
    default:
      return severityLevel === 3 ? "minor" : "info";
  }
}

const toDate = (s: number | Long | null | undefined) => {
  if (s == null) return undefined;
  const n = typeof s === "number" ? s : Number(s);
  return n > 0 ? new Date(n * 1000) : undefined;
};
type Long = { toNumber(): number } | number;

export interface GtfsRtOptions {
  defaultMode: Mode;
  /** route_id -> human name. */
  routeNames?: Record<string, string>;
  /** route_id -> mode, when one feed mixes modes. */
  routeModes?: Record<string, Mode>;
  /** Preferred languages for translated strings. */
  languages?: string[];
  /** Only keep alerts active at `now` (default true). */
  activeOnly?: boolean;
}

export function alertsFromFeed(feed: FeedMessage, opts: GtfsRtOptions, now: Date): Alert[] {
  const out: Alert[] = [];
  for (const e of feed.entity) {
    const a = e.alert;
    if (!a || e.isDeleted) continue;
    const periods = a.activePeriod ?? [];
    const active =
      periods.length === 0 ||
      periods.some((p) => {
        const s = toDate(p.start as Long)?.getTime() ?? -Infinity;
        const en = toDate(p.end as Long)?.getTime() ?? Infinity;
        return s <= now.getTime() && now.getTime() <= en;
      });
    if ((opts.activeOnly ?? true) && !active) continue;
    const title = pickText(a.headerText, opts.languages) ?? pickText(a.descriptionText, opts.languages);
    if (!title) continue;
    const effect = effectName(a.effect);
    const routeIds = [...new Set((a.informedEntity ?? []).map((ie) => ie.routeId).filter(Boolean) as string[])];
    const modes = [
      ...new Set(routeIds.map((r) => opts.routeModes?.[r] ?? opts.defaultMode)),
    ] as Mode[];
    const current = periods.find((p) => {
      const s = toDate(p.start as Long)?.getTime() ?? -Infinity;
      const en = toDate(p.end as Long)?.getTime() ?? Infinity;
      return s <= now.getTime() && now.getTime() <= en;
    });
    out.push({
      id: e.id,
      severity: severityFromEffect(effect, (a as { severityLevel?: number }).severityLevel),
      effect: effect === "UNKNOWN_EFFECT" ? undefined : effect,
      cause: causeName(a.cause),
      title: title.slice(0, 500),
      description: pickText(a.descriptionText, opts.languages)?.slice(0, 4000),
      url: pickText(a.url, opts.languages),
      modes: modes.length ? modes : [opts.defaultMode],
      routes: routeIds.map((r) => opts.routeNames?.[r] ?? r).slice(0, 50),
      stops: [...new Set((a.informedEntity ?? []).map((ie) => ie.stopId).filter(Boolean) as string[])].slice(0, 50),
      activeFrom: toDate(current?.start as Long),
      activeUntil: toDate(current?.end as Long),
    });
  }
  return out;
}

export function vehiclesFromFeed(feed: FeedMessage, opts: GtfsRtOptions): Vehicle[] {
  const out: Vehicle[] = [];
  for (const e of feed.entity) {
    const v = e.vehicle;
    const pos = v?.position;
    if (!v || !pos || !pos.latitude || !pos.longitude) continue;
    if (Math.abs(pos.latitude) < 0.01 && Math.abs(pos.longitude) < 0.01) continue;
    const routeId = v.trip?.routeId || undefined;
    out.push({
      id: v.vehicle?.id || e.id,
      mode: (routeId && opts.routeModes?.[routeId]) || opts.defaultMode,
      routeId,
      routeName: routeId ? (opts.routeNames?.[routeId] ?? routeId) : undefined,
      tripId: v.trip?.tripId || undefined,
      lat: pos.latitude,
      lon: pos.longitude,
      bearing: pos.bearing ?? undefined,
      speed: pos.speed ?? undefined,
      label: v.vehicle?.label || undefined,
      observedAt: toDate(v.timestamp as Long),
    });
  }
  return out;
}

export interface GtfsRtFeedConfig extends GtfsRtOptions {
  alerts?: string | string[];
  vehicles?: string | string[];
  headers?: Record<string, string>;
}

/** Build a connector for agencies that publish standard GTFS-Realtime feeds. */
export function gtfsRtConnector(meta: SourceMeta, cfg: GtfsRtFeedConfig): Connector {
  const list = (x?: string | string[]) => (x ? (Array.isArray(x) ? x : [x]) : []);
  return {
    meta,
    async fetch(ctx: ConnectorContext): Promise<IngestResult> {
      const init = cfg.headers ? { headers: cfg.headers } : undefined;
      const [alertFeeds, vehicleFeeds] = await Promise.all([
        Promise.all(list(cfg.alerts).map(async (u) => decodeFeed(await fetchBuffer(ctx, u, init)))),
        Promise.all(list(cfg.vehicles).map(async (u) => decodeFeed(await fetchBuffer(ctx, u, init)))),
      ]);
      const result: IngestResult = {};
      if (cfg.alerts) result.alerts = alertFeeds.flatMap((f) => alertsFromFeed(f, cfg, ctx.now));
      if (cfg.vehicles) result.vehicles = vehicleFeeds.flatMap((f) => vehiclesFromFeed(f, cfg));
      return result;
    },
  };
}
