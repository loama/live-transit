"use client";
import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useMap } from "./use-map";

export interface SlimVehicle { id: string; lat: number; lon: number; mode: string; route: string | null }

const toGeo = (vs: SlimVehicle[]) => ({
  type: "FeatureCollection" as const,
  features: vs.map((v) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [v.lon, v.lat] },
    properties: { id: v.id, route: v.route ?? "", mode: v.mode },
  })),
});

export function VehicleMap({ sourceId, initial }: { sourceId: string; initial: SlimVehicle[] }) {
  const el = useRef<HTMLDivElement>(null);
  const current = useRef(initial);
  const fitted = useRef(false);
  const { mapRef, ready } = useMap(el, { center: [initial[0]?.lon ?? 0, initial[0]?.lat ?? 0], zoom: 9, cooperativeGestures: true }, install);

  function fit(map: MlMap, vs: SlimVehicle[]) {
    if (fitted.current || !vs.length) return;
    fitted.current = true;
    const lons = vs.map((v) => v.lon).sort((a, b) => a - b);
    const lats = vs.map((v) => v.lat).sort((a, b) => a - b);
    const q = (a: number[], p: number) => a[Math.floor((a.length - 1) * p)];
    map.fitBounds([[q(lons, 0.03), q(lats, 0.03)], [q(lons, 0.97), q(lats, 0.97)]], { padding: 40, maxZoom: 13, duration: 0 });
  }

  function install(map: MlMap) {
    const cs = getComputedStyle(document.documentElement);
    map.addSource("veh", { type: "geojson", data: toGeo(current.current) });
    map.addLayer({ id: "veh", type: "circle", source: "veh", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 6],
      "circle-color": cs.getPropertyValue("--accent").trim(),
      "circle-stroke-width": 1, "circle-stroke-color": cs.getPropertyValue("--surface").trim(),
    } });
    fit(map, current.current);
  }

  useEffect(() => {
    if (!ready) return;
    const tick = async () => {
      try {
        const r = await fetch(`/api/v1/vehicles?sourceId=${encodeURIComponent(sourceId)}&limit=2000`);
        if (!r.ok) return;
        const rows = (await r.json()).data as { id: string; lat: number; lon: number; mode: string; routeName: string | null }[];
        current.current = rows.map((v) => ({ id: v.id, lat: v.lat, lon: v.lon, mode: v.mode, route: v.routeName }));
        const map = mapRef.current;
        (map?.getSource("veh") as GeoJSONSource | undefined)?.setData(toGeo(current.current));
        if (map) fit(map, current.current);
      } catch {}
    };
    const t = setInterval(() => { if (!document.hidden) tick(); }, 30_000);
    return () => clearInterval(t);
  }, [ready, sourceId, mapRef]);

  return (
    <div className="relative h-[380px] overflow-hidden rounded-xl border border-border bg-surface-2 sm:h-[460px]">
      <div ref={el} className="absolute inset-0" style={{ position: "absolute" }} role="application" aria-label="Live map of vehicle positions" />
    </div>
  );
}
