"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMap } from "./use-map";
import { bindSourceInteractions, installSourceLayers, setSources, type MapSource } from "./source-layers";

export type { MapSource };

export function WorldMap({ sources, className = "" }: { sources: MapSource[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const data = useRef(sources);
  const { mapRef, ready } = useMap(el, { center: [10, 30], zoom: 1.2, minZoom: 0.8, cooperativeGestures: true }, (map) => installSourceLayers(map, data.current));

  useEffect(() => {
    data.current = sources;
    setSources(mapRef.current, sources);
  }, [sources, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    return bindSourceInteractions(map, (id) => router.push(`/n/${encodeURIComponent(id)}`));
  }, [ready, mapRef, router]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-surface-2 ${className}`}>
      <div ref={el} className="absolute inset-0" style={{ position: "absolute" }} role="application" aria-label="World map of transit sources, colored by health" />
    </div>
  );
}
