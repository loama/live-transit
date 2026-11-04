"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { useMap } from "@/components/map/use-map";
import { useLiveVehicles } from "@/components/map/use-live-vehicles";
import {
  bindVehiclePopups, highlightLine, installTransitLayers, lineKey, positionsOf, setRoutes, tweenVehicles,
  type MapRoute, type MapVehicle,
} from "@/components/map/transit-layers";
import { decodePolyline } from "@/lib/polyline";
import { Section } from "@/components/ui/section";
import { LiveBadge } from "@/components/ui/live-badge";
import { LinesExplorer, type SlimLine } from "./lines-explorer";

export interface NetworkLiveProps {
  sourceId: string;
  /** Routes with geometry when the network is small enough to inline; otherwise loaded per viewport. */
  routes: MapRoute[] | null;
  routeCount: number;
  lines: SlimLine[];
  vehicles: MapVehicle[];
  /** Whether the connector can read the operator's feed on demand. */
  realtime: boolean;
  center: [number, number] | null;
}

const VIEWPORT_MIN_ZOOM = 9;

function fitTo(map: MlMap, vehicles: MapVehicle[], routes: MapRoute[] | null) {
  const pts: [number, number][] = vehicles.map((v) => [v.lon, v.lat]);
  if (pts.length < 3 && routes?.length) {
    for (const r of routes) for (const s of r.shapes ?? []) if (s.length) pts.push(...ends(s));
  }
  if (pts.length < 2) return false;
  const lons = pts.map((p) => p[0]).sort((a, b) => a - b);
  const lats = pts.map((p) => p[1]).sort((a, b) => a - b);
  const q = (a: number[], p: number) => a[Math.floor((a.length - 1) * p)];
  // Trim outliers so one stray vehicle or regional line does not zoom the map out to a whole country.
  map.fitBounds([[q(lons, 0.03), q(lats, 0.03)], [q(lons, 0.97), q(lats, 0.97)]], { padding: 40, maxZoom: 13.5, duration: 0 });
  return true;
}

/** A few points per shape are enough to bound a network. */
function ends(encoded: string): [number, number][] {
  const d = decodePolyline(encoded);
  return d.length > 2 ? [d[0], d[d.length >> 1], d[d.length - 1]] : d;
}

export function NetworkLive(p: NetworkLiveProps) {
  const el = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const hasMap = p.vehicles.length > 0 || (p.routes?.length ?? 0) > 0 || p.routeCount > 0;
  const live = useLiveVehicles(hasMap ? `/api/v1/sources/${encodeURIComponent(p.sourceId)}/live` : null, p.realtime ? 10_000 : 30_000, p.vehicles);
  const shown = useRef(p.vehicles);
  const cancelTween = useRef<() => void>(() => {});
  const loaded = useRef(new Map<string, MapRoute>((p.routes ?? []).map((r) => [r.routeId, r])));
  const fitted = useRef(false);

  const { mapRef, ready } = useMap(
    el,
    { center: p.center ?? [0, 20], zoom: p.center ? 10 : 1.5, cooperativeGestures: true },
    (map) => {
      installTransitLayers(map, { routes: [...loaded.current.values()], vehicles: shown.current });
      if (!fitted.current) fitted.current = fitTo(map, shown.current, p.routes);
    },
  );

  // Vehicles: animate from the positions on screen to the latest ones.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || live.updatedAt === null) return;
    cancelTween.current();
    cancelTween.current = tweenVehicles(map, positionsOf(shown.current), live.vehicles);
    shown.current = live.vehicles;
    if (!fitted.current) fitted.current = fitTo(map, live.vehicles, p.routes);
  }, [ready, live.updatedAt, live.vehicles, mapRef, p.routes]);

  // Large networks: fetch route geometry for the visible area only.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || p.routes) return;
    let ac: AbortController | undefined;
    const seen = new Set<string>();
    const load = async () => {
      if (map.getZoom() < VIEWPORT_MIN_ZOOM) return;
      const b = map.getBounds();
      const r2 = (n: number, up: boolean) => (up ? Math.ceil(n * 10) : Math.floor(n * 10)) / 10;
      const bbox = [r2(b.getWest(), false), r2(b.getSouth(), false), r2(b.getEast(), true), r2(b.getNorth(), true)].join(",");
      if (seen.has(bbox)) return;
      ac?.abort();
      ac = new AbortController();
      try {
        const r = await fetch(`/api/v1/routes?sourceId=${encodeURIComponent(p.sourceId)}&bbox=${bbox}&geometry=true&limit=1500`, { signal: ac.signal });
        if (!r.ok) return;
        seen.add(bbox);
        for (const route of (await r.json()).data as MapRoute[]) loaded.current.set(route.routeId, route);
        setRoutes(map, [...loaded.current.values()]);
      } catch {}
    };
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 250); };
    map.on("moveend", debounced);
    load();
    return () => { map.off("moveend", debounced); clearTimeout(t); ac?.abort(); };
  }, [ready, mapRef, p.routes, p.sourceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const byId = () => new Map(shown.current.map((v) => [`${v.sourceId}|${v.id}`, v]));
    return bindVehiclePopups(
      map,
      (vid) => byId().get(vid),
      (v) => (v.routeId ? { href: `/n/${encodeURIComponent(p.sourceId)}/l/${encodeURIComponent(v.routeId)}` } : {}),
      (key) => setSelected((s) => (s === key ? null : key)),
    );
  }, [ready, mapRef, p.sourceId]);

  useEffect(() => { if (ready) highlightLine(mapRef.current, selected); }, [ready, selected, mapRef]);

  const counts = useMemo(() => {
    if (live.updatedAt === null) return null;
    const m = new Map<string, number>();
    for (const v of live.vehicles) if (v.routeId) m.set(v.routeId, (m.get(v.routeId) ?? 0) + 1);
    return m;
  }, [live.updatedAt, live.vehicles]);

  const selectedLine = selected ? p.lines.find((l) => lineKey(p.sourceId, l.lineId) === selected) : undefined;

  const showOnMap = (lineId: string) => {
    setSelected(lineKey(p.sourceId, lineId));
    const map = mapRef.current;
    const r = loaded.current.get(lineId);
    if (map && r?.shapes?.length) {
      const pts = r.shapes.flatMap(decodePolyline);
      const lons = pts.map((x) => x[0]);
      const lats = pts.map((x) => x[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 14 });
    }
    el.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  };

  return (
    <>
      {hasMap && (
        <Section
          title="Live map"
          hint={<LiveBadge count={live.vehicles.length} live={live.live} realtime={p.realtime} updatedAt={live.updatedAt} error={live.error} />}
        >
          <div className="relative h-[400px] overflow-hidden rounded-xl border border-border bg-surface-2 sm:h-[520px]">
            <div ref={el} className="absolute inset-0" style={{ position: "absolute" }} role="application" aria-label="Map of lines and live vehicle positions" />
            {selectedLine && (
              <div className="absolute left-3 top-3 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-lg border border-border bg-surface/95 px-3 py-1.5 text-sm shadow-sm backdrop-blur">
                <span className="truncate font-medium">Line {selectedLine.lineName}</span>
                <a href={`/n/${encodeURIComponent(p.sourceId)}/l/${encodeURIComponent(selectedLine.lineId)}`} className="shrink-0 text-accent hover:underline">Details</a>
                <button type="button" onClick={() => setSelected(null)} className="shrink-0 rounded px-1 text-muted hover:text-fg" aria-label="Clear line highlight">&times;</button>
              </div>
            )}
          </div>
          {p.routeCount > 0 && !p.routes && (
            <p className="mt-2 text-xs text-muted">Zoom in to see route lines; this network has {p.routeCount.toLocaleString("en-US")} of them.</p>
          )}
        </Section>
      )}
      <LinesExplorer sourceId={p.sourceId} lines={p.lines} counts={counts} onShowOnMap={hasMap ? showOnMap : undefined} selectedId={selectedLine?.lineId ?? null} />
    </>
  );
}
