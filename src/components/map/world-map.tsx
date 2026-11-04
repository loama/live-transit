"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useMap } from "./use-map";
import { TONE_VAR, type Tone } from "@/components/ui/status";

export interface MapSource {
  id: string; name: string; city: string | null; lat: number; lon: number; tone: Tone; note: string;
}

/** Severity order used to color a cluster by its worst member. */
const RANK: Record<Tone, number> = { good: 0, unknown: 1, minor: 2, major: 3, severe: 4 };
const RANKED: Tone[] = ["good", "unknown", "minor", "major", "severe"];

function toGeoJson(sources: MapSource[]) {
  return {
    type: "FeatureCollection" as const,
    features: sources.map((s) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
      properties: { id: s.id, title: s.city ? `${s.city}, ${s.name}` : s.name, note: s.note, tone: s.tone, rank: RANK[s.tone] },
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
    const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
    const solo = ["!", ["has", "point_count"]];
    const worst = ["step", ["get", "worst"], readVar("good"), ...RANKED.slice(1).flatMap((t, i) => [i + 1, readVar(t)])];
    map.addSource("sources", { type: "geojson", data: toGeoJson(data.current), cluster: true, clusterRadius: 42, clusterMaxZoom: 6,
      clusterProperties: { worst: ["max", ["get", "rank"]] } });
    map.addLayer({ id: "halo", type: "circle", source: "sources", filter: solo as never,
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 7, 8, 14], "circle-color": colors as never, "circle-opacity": 0.2 } });
    map.addLayer({ id: "dots", type: "circle", source: "sources", filter: solo as never,
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3.5, 8, 7], "circle-color": colors as never,
        "circle-stroke-width": 1.5, "circle-stroke-color": surface } });
    map.addLayer({ id: "clusters", type: "circle", source: "sources", filter: ["has", "point_count"],
      paint: { "circle-color": worst as never, "circle-opacity": 0.9, "circle-stroke-width": 2, "circle-stroke-color": surface,
        "circle-radius": ["step", ["get", "point_count"], 12, 5, 15, 15, 19, 40, 24] } });
    map.addLayer({ id: "cluster-count", type: "symbol", source: "sources", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
      paint: { "text-color": "#ffffff" } });
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
    const expand = async (e: import("maplibre-gl").MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const src = map.getSource("sources") as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(Number(f.properties.cluster_id));
      map.easeTo({ center: f.geometry.coordinates as [number, number], zoom: zoom + 0.5 });
    };
    const over = () => { map.getCanvas().style.cursor = "pointer"; };
    const out = () => { map.getCanvas().style.cursor = ""; };
    map.on("click", "clusters", expand);
    map.on("mouseenter", "clusters", over);
    map.on("mouseleave", "clusters", out);
    map.on("mousemove", "dots", enter);
    map.on("mouseleave", "dots", leave);
    map.on("click", "dots", click);
    return () => {
      map.off("mousemove", "dots", enter);
      map.off("mouseleave", "dots", leave);
      map.off("click", "dots", click);
      map.off("click", "clusters", expand);
      map.off("mouseenter", "clusters", over);
      map.off("mouseleave", "clusters", out);
      popup?.remove();
    };
  }, [ready, mapRef, router]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-surface-2 ${className}`}>
      <div ref={el} className="absolute inset-0" style={{ position: "absolute" }} role="application" aria-label="World map of transit sources, colored by health" />
    </div>
  );
}
