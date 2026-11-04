"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useMap } from "./use-map";
import { TONE_VAR, type Tone } from "@/components/ui/status";

export interface MapSource {
  id: string; name: string; city: string | null; lat: number; lon: number; tone: Tone; note: string;
}

function toGeoJson(sources: MapSource[]) {
  return {
    type: "FeatureCollection" as const,
    features: sources.map((s) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
      properties: { id: s.id, title: s.city ? `${s.city}, ${s.name}` : s.name, note: s.note, tone: s.tone },
    })),
  };
}

function readVar(t: Tone) {
  if (typeof document === "undefined") return "#888";
  const name = TONE_VAR[t].slice(4, -1);
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function WorldMap({ sources, className = "" }: { sources: MapSource[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const data = useRef(sources);
  const { mapRef, ready } = useMap(el, { center: [10, 30], zoom: 1.2, minZoom: 0.8, cooperativeGestures: true }, install);

  function install(map: MlMap) {
    const colors = ["match", ["get", "tone"], ...(["good", "minor", "major", "severe"] as Tone[]).flatMap((t) => [t, readVar(t)]), readVar("unknown")];
    map.addSource("sources", { type: "geojson", data: toGeoJson(data.current) });
    map.addLayer({ id: "halo", type: "circle", source: "sources",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 7, 8, 14], "circle-color": colors as never, "circle-opacity": 0.2 } });
    map.addLayer({ id: "dots", type: "circle", source: "sources",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3.5, 8, 7], "circle-color": colors as never,
        "circle-stroke-width": 1.5, "circle-stroke-color": getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() } });
  }

  useEffect(() => {
    data.current = sources;
    (mapRef.current?.getSource("sources") as GeoJSONSource | undefined)?.setData(toGeoJson(sources));
  }, [sources, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let popup: import("maplibre-gl").Popup | undefined;
    const enter = async (e: import("maplibre-gl").MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const ml = await import("maplibre-gl");
      popup?.remove();
      const box = document.createElement("div");
      const b = document.createElement("strong");
      b.textContent = String(f.properties.title);
      const n = document.createElement("div");
      n.textContent = String(f.properties.note);
      box.append(b, n);
      box.style.cssText = "font:12px/1.4 system-ui;color:#151513";
      popup = new ml.Popup({ closeButton: false, offset: 10 }).setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(box).addTo(map);
    };
    const leave = () => { map.getCanvas().style.cursor = ""; popup?.remove(); };
    const click = (e: import("maplibre-gl").MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) router.push(`/n/${encodeURIComponent(String(id))}`);
    };
    map.on("mousemove", "dots", enter);
    map.on("mouseleave", "dots", leave);
    map.on("click", "dots", click);
    return () => {
      map.off("mousemove", "dots", enter);
      map.off("mouseleave", "dots", leave);
      map.off("click", "dots", click);
      popup?.remove();
    };
  }, [ready, mapRef, router]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-surface-2 ${className}`}>
      <div ref={el} className="absolute inset-0" style={{ position: "absolute" }} role="application" aria-label="World map of transit sources, colored by health" />
    </div>
  );
}
