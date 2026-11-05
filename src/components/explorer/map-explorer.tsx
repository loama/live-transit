"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as MlMap } from "maplibre-gl";
import { useMap } from "@/components/map/use-map";
import { bindSourceInteractions, installSourceLayers, SOURCE_LAYERS, type MapSource } from "@/components/map/source-layers";
import {
  bindVehiclePopups, highlightLine, installTransitLayers, positionsOf, setRoutes, setStops, tweenVehicles,
  type MapRoute, type MapStop, type MapVehicle,
} from "@/components/map/transit-layers";
import { MapControls, type Place } from "./map-controls";

const ZOOM_VEHICLES = 7.5;
const ZOOM_ROUTES = 9.5;
const ZOOM_STOPS = 13.5;
const REFRESH_MS = 15_000;
const VEHICLE_LAYERS = ["veh-dot", "veh-arrow", "veh-label"];
const ROUTE_LAYERS = ["routes-casing", "routes-line", "routes-label"];

/** Rounded outward to 2 decimals so neighbouring views share CDN cache entries. */
function bboxOf(map: MlMap) {
  const b = map.getBounds();
  const f = (n: number) => Math.floor(n * 100) / 100;
  const c = (n: number) => Math.ceil(n * 100) / 100;
  return [f(Math.max(-180, b.getWest())), f(Math.max(-90, b.getSouth())), c(Math.min(180, b.getEast())), c(Math.min(90, b.getNorth()))].join(",");
}

function readView(): { center: [number, number]; zoom: number } | null {
  const p = new URLSearchParams(window.location.search);
  const [lat, lon, z] = ["lat", "lon", "z"].map((k) => Number.parseFloat(p.get(k) ?? ""));
  return [lat, lon, z].every(Number.isFinite) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { center: [lon, lat], zoom: z } : null;
}

export function MapExplorer({ sources, places }: { sources: MapSource[]; places: Place[] }) {
  const el = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [zoom, setZoom] = useState(1.2);
  const [modes, setModes] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const vehicles = useRef<MapVehicle[]>([]);
  const routes = useRef(new Map<string, MapRoute>());
  const stops = useRef(new Map<string, MapStop>());
  const filter = useRef<unknown>(null);
  const cancelTween = useRef<() => void>(() => {});
  const names = useRef(new Map(places.map((p) => [p.id, p.name])));

  const applyView = (map: MlMap) => {
    const vis = map.getZoom() >= ZOOM_VEHICLES;
    for (const l of SOURCE_LAYERS) map.setLayoutProperty(l, "visibility", vis ? "none" : "visible");
    for (const l of VEHICLE_LAYERS) map.setLayoutProperty(l, "visibility", vis ? "visible" : "none");
    for (const l of [...VEHICLE_LAYERS, ...ROUTE_LAYERS]) map.setFilter(l, filter.current as never);
  };

  const { mapRef, ready } = useMap(el, { center: [10, 30], zoom: 1.2, minZoom: 0.8, ...readViewSafe() }, (map) => {
    // Runs again after a theme switch replaces the style, so restore everything from refs.
    installSourceLayers(map, sources);
    installTransitLayers(map, { routes: [...routes.current.values()], vehicles: vehicles.current, stops: [...stops.current.values()] });
    applyView(map);
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let ac: AbortController | undefined;
    const seenRoutes = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loadVehicles = async () => {
      if (document.hidden || map.getZoom() < ZOOM_VEHICLES) return;
      ac?.abort();
      ac = new AbortController();
      try {
        const r = await fetch(`/api/v1/vehicles?bbox=${bboxOf(map)}&limit=5000`, { signal: ac.signal });
        if (!r.ok) throw new Error(String(r.status));
        const next = (await r.json()).data as MapVehicle[];
        cancelTween.current();
        cancelTween.current = tweenVehicles(map, positionsOf(vehicles.current), next);
        vehicles.current = next;
        setCount(next.length);
        setUpdatedAt(Date.now());
        setError(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      }
    };

    const loadRoutes = async () => {
      if (map.getZoom() < ZOOM_ROUTES) return;
      const bbox = bboxOf(map);
      if (seenRoutes.has(bbox)) return;
      try {
        const r = await fetch(`/api/v1/routes?bbox=${bbox}&geometry=true&limit=1500`);
        if (!r.ok) return;
        seenRoutes.add(bbox);
        for (const route of (await r.json()).data as MapRoute[]) routes.current.set(`${route.sourceId}|${route.routeId}`, route);
        setRoutes(map, [...routes.current.values()]);
      } catch {}
    };

    const seenStops = new Set<string>();
    const loadStops = async () => {
      if (map.getZoom() < ZOOM_STOPS) return;
      const bbox = bboxOf(map);
      if (seenStops.has(bbox)) return;
      try {
        const r = await fetch(`/api/v1/stops?bbox=${bbox}&limit=5000`);
        if (!r.ok) return;
        seenStops.add(bbox);
        for (const s of (await r.json()).data as MapStop[]) stops.current.set(`${s.sourceId}|${s.lat}|${s.lon}`, s);
        setStops(map, [...stops.current.values()]);
      } catch {}
    };

    const onMoveEnd = () => {
      const c = map.getCenter();
      const url = new URL(window.location.href);
      url.searchParams.set("lat", c.lat.toFixed(4));
      url.searchParams.set("lon", c.lng.toFixed(4));
      url.searchParams.set("z", map.getZoom().toFixed(2));
      window.history.replaceState(window.history.state, "", url);
      clearTimeout(timer);
      timer = setTimeout(() => { loadVehicles(); loadRoutes(); loadStops(); }, 300);
    };
    const onZoom = () => {
      setZoom(map.getZoom());
      applyView(map);
    };
    const clearHighlight = (e: { point: { x: number; y: number } }) => {
      if (!map.queryRenderedFeatures([e.point.x, e.point.y], { layers: ["veh-dot", "routes-line"] }).length) highlightLine(map, null);
    };

    map.on("moveend", onMoveEnd);
    map.on("zoomend", onZoom);
    map.on("click", clearHighlight);
    const unbindSources = bindSourceInteractions(map, (id) => router.push(`/n/${encodeURIComponent(id)}`));
    const unbindVehicles = bindVehiclePopups(
      map,
      (vid) => vehicles.current.find((v) => `${v.sourceId}|${v.id}` === vid),
      (v) => ({ network: names.current.get(v.sourceId), href: v.routeId ? `/n/${encodeURIComponent(v.sourceId)}/l/${encodeURIComponent(v.routeId)}` : undefined }),
      (key) => highlightLine(map, key),
    );
    const every = setInterval(loadVehicles, REFRESH_MS);
    const vis = () => { if (!document.hidden) loadVehicles(); };
    document.addEventListener("visibilitychange", vis);
    onZoom();
    onMoveEnd();
    return () => {
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onZoom);
      map.off("click", clearHighlight);
      unbindSources();
      unbindVehicles();
      clearInterval(every);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", vis);
      ac?.abort();
      cancelTween.current();
    };
  }, [ready, mapRef, router]);

  useEffect(() => {
    const map = mapRef.current;
    filter.current = modes.size ? ["in", ["get", "mode"], ["literal", [...modes]]] : null;
    if (ready && map) applyView(map);
    setCount(modes.size ? vehicles.current.filter((v) => modes.has(v.mode)).length : vehicles.current.length);
  }, [modes, ready, mapRef]);

  return (
    <div className="relative h-[calc(100dvh-6rem)] md:h-[calc(100dvh-3.5rem)]">
      <div ref={el} className="absolute inset-0" style={{ position: "absolute" }} role="application" aria-label="Live map of transit networks, lines and vehicles" />
      <MapControls
        showVehicles={zoom >= ZOOM_VEHICLES}
        vehicleCount={count}
        updatedAt={updatedAt}
        error={error}
        modes={modes}
        onModeToggle={(m) => setModes((prev) => {
          const next = new Set(prev);
          if (!next.delete(m)) next.add(m);
          return next;
        })}
        places={places}
        onFly={(lat, lon, z = 11.5) => mapRef.current?.flyTo({ center: [lon, lat], zoom: z })}
      />
    </div>
  );
}

function readViewSafe() {
  return typeof window === "undefined" ? {} : (readView() ?? {});
}
