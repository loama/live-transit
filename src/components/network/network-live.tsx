"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { useMap } from "@/components/map/use-map";
import { useLiveVehicles } from "@/components/map/use-live-vehicles";
import {
  bindVehiclePopups, highlightLine, installTransitLayers, lineKey, positionsOf, setRoutes, tweenVehicles,
  type MapRoute, type MapVehicle,
} from "@/components/map/transit-layers";
import { loadGeo, roundedBbox } from "@/components/map/geo-tiles";
import { Section } from "@/components/ui/section";
import { LiveBadge } from "@/components/ui/live-badge";
import { LinesExplorer, type SlimLine } from "./lines-explorer";

export interface NetworkLiveProps {
  sourceId: string;
  routeCount: number;
  /** [minLon, minLat, maxLon, maxLat] of the network's route geometry. */
  bbox: [number, number, number, number] | null;
  lines: SlimLine[];
  vehicles: MapVehicle[];
  /** Whether the connector can read the operator's feed on demand. */
  realtime: boolean;
  center: [number, number] | null;
}

/** Below this zoom the network's geometry is not loaded; a whole region would be too much at once. */
const GEO_MIN_ZOOM = 8;

function fitTo(map: MlMap, vehicles: MapVehicle[], bbox: NetworkLiveProps["bbox"]) {
  if (vehicles.length < 3) {
    if (!bbox) return false;
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, maxZoom: 13.5, duration: 0 });
    return true;
  }
  const pts: [number, number][] = vehicles.map((v) => [v.lon, v.lat]);
  const lons = pts.map((p) => p[0]).sort((a, b) => a - b);
  const lats = pts.map((p) => p[1]).sort((a, b) => a - b);
  const q = (a: number[], p: number) => a[Math.floor((a.length - 1) * p)];
  // Trim outliers so one stray vehicle or regional line does not zoom the map out to a whole country.
  map.fitBounds([[q(lons, 0.03), q(lats, 0.03)], [q(lons, 0.97), q(lats, 0.97)]], { padding: 40, maxZoom: 13.5, duration: 0 });
  return true;
}

export function NetworkLive(p: NetworkLiveProps) {
  const el = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const hasMap = p.vehicles.length > 0 || p.routeCount > 0;
  const live = useLiveVehicles(hasMap ? `/api/v1/sources/${encodeURIComponent(p.sourceId)}/live` : null, p.realtime ? 10_000 : 30_000, p.vehicles);
  const shown = useRef(p.vehicles);
  const cancelTween = useRef<() => void>(() => {});
  const loaded = useRef(new Map<string, MapRoute>());
  const fitted = useRef(false);

  const { mapRef, ready } = useMap(
    el,
    { center: p.center ?? [0, 20], zoom: p.center ? 10 : 1.5, cooperativeGestures: true },
    (map) => {
      installTransitLayers(map, { routes: [...loaded.current.values()], vehicles: shown.current });
      if (!fitted.current) fitted.current = fitTo(map, shown.current, p.bbox);
    },
  );

  // Vehicles: animate from the positions on screen to the latest ones.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || live.updatedAt === null) return;
    cancelTween.current();
    cancelTween.current = tweenVehicles(map, positionsOf(shown.current), live.vehicles);
    shown.current = live.vehicles;
    if (!fitted.current) fitted.current = fitTo(map, live.vehicles, p.bbox);
  }, [ready, live.updatedAt, live.vehicles, mapRef, p.bbox]);

  // Route geometry for the visible area, from the network's geometry files.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !p.routeCount) return;
    let ac: AbortController | undefined;
    const seen = new Set<string>();
    const load = async () => {
      if (map.getZoom() < GEO_MIN_ZOOM) return;
      const bbox = roundedBbox(map.getBounds());
      if (seen.has(bbox)) return;
      ac?.abort();
      ac = new AbortController();
      try {
        await loadGeo(bbox, loaded.current, { sourceId: p.sourceId, signal: ac.signal });
        seen.add(bbox);
        setRoutes(map, [...loaded.current.values()]);
      } catch {}
    };
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 250); };
    map.on("moveend", debounced);
    load();
    return () => { map.off("moveend", debounced); clearTimeout(t); ac?.abort(); };
  }, [ready, mapRef, p.routeCount, p.sourceId]);

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
    const b = p.lines.find((l) => l.lineId === lineId)?.bbox;
    if (b) mapRef.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 14 });
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
        </Section>
      )}
      <LinesExplorer sourceId={p.sourceId} lines={p.lines} counts={counts} onShowOnMap={hasMap ? showOnMap : undefined} selectedId={selectedLine?.lineId ?? null} />
    </>
  );
}
