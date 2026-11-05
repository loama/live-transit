import type postgres from "postgres";
import { stateFromEffect, worse } from "@/connectors/north-america/util";
import type { Alert, IngestResult, LineState, LineStatus, Mode, Vehicle } from "@/lib/types";

/** The parts of a static GTFS route that live data is joined against. */
export interface CatalogRoute {
  routeId: string;
  name: string;
  mode: Mode;
  color: string | null;
}

export type Catalog = Map<string, CatalogRoute>;

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; p: Promise<Catalog> }>();

/** Route catalog for a source, cached per process for ten minutes. Empty when no static feed is imported. */
export function loadCatalog(sql: postgres.Sql, sourceId: string): Promise<Catalog> {
  const hit = cache.get(sourceId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = sql`SELECT route_id, name, mode, color FROM routes WHERE source_id = ${sourceId}`.then(
    (rows) => new Map(rows.map((r) => [r.route_id as string, { routeId: r.route_id as string, name: r.name as string, mode: r.mode as Mode, color: (r.color as string) ?? null }])),
  );
  p.catch(() => cache.delete(sourceId));
  cache.set(sourceId, { at: Date.now(), p });
  return p;
}

export function enrichVehicles(vehicles: Vehicle[], cat: Catalog): Vehicle[] {
  if (!cat.size) return vehicles;
  return vehicles.map((v) => {
    const r = v.routeId ? cat.get(v.routeId) : undefined;
    if (!r) return v;
    return {
      ...v,
      mode: r.mode,
      routeName: !v.routeName || v.routeName === v.routeId ? r.name : v.routeName,
      color: v.color ?? r.color ?? undefined,
    };
  });
}

/** Line state implied by one alert: its GTFS effect when known, else its severity. */
export function stateFromAlert(a: Alert): LineState | undefined {
  const s = stateFromEffect(a.effect);
  if (s) return s;
  if (a.severity === "severe") return "major";
  if (a.severity === "major") return "minor";
  return undefined;
}

/**
 * Join a connector result with the source's static route catalog:
 * vehicles get route names, modes and colors; alerts that name routes by id get readable names;
 * and when the connector publishes no per-line status, every catalog route becomes a line whose
 * state is the worst implied by the alerts naming it.
 */
export function applyCatalog(result: IngestResult, cat: Catalog): IngestResult {
  if (!cat.size) return result;
  const out: IngestResult = { ...result };
  if (result.vehicles) out.vehicles = enrichVehicles(result.vehicles, cat);

  if (!result.lines) {
    const byKey = new Map<string, CatalogRoute>();
    for (const r of cat.values()) {
      byKey.set(r.routeId.toLowerCase(), r);
      if (!byKey.has(r.name.toLowerCase())) byKey.set(r.name.toLowerCase(), r);
    }
    const hits = new Map<string, { state: LineState; text: string }>();
    for (const a of result.alerts ?? []) {
      const s = stateFromAlert(a);
      if (!s) continue;
      for (const ref of a.routes ?? []) {
        const r = byKey.get(ref.toLowerCase());
        if (!r) continue;
        const prev = hits.get(r.routeId);
        if (!prev || worse(prev.state, s) !== prev.state) hits.set(r.routeId, { state: s, text: a.title });
      }
    }
    const published = !!result.alerts;
    out.lines = [...cat.values()].map((r): LineStatus => {
      const h = hits.get(r.routeId);
      return {
        lineId: r.routeId,
        lineName: r.name,
        mode: r.mode,
        color: r.color ?? undefined,
        status: h?.state ?? (published ? "good" : "unknown"),
        statusText: (h?.text ?? (published ? "No disruptions reported" : "No alert feed published")).slice(0, 200),
      };
    });
  }

  if (result.alerts) {
    out.alerts = result.alerts.map((a) => {
      if (!a.routes?.length) return a;
      const named = a.routes.map((x) => cat.get(x));
      if (!named.some(Boolean)) return a;
      const modes = [...new Set(named.filter(Boolean).map((r) => r!.mode))];
      return { ...a, routes: [...new Set(a.routes.map((x, i) => named[i]?.name ?? x))], modes: modes.length ? modes : a.modes };
    });
  }
  return out;
}
