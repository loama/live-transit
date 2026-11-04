"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMap } from "@/components/map/use-map";
import { bindSourceInteractions, installSourceLayers, type MapSource } from "@/components/map/source-layers";

/** Airports colored by their delay state; click one to open its board. */
export function AirportsMap({ airports }: { airports: MapSource[] }) {
  const el = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { mapRef, ready } = useMap(el, { center: [10, 25], zoom: 1.1, minZoom: 0.8, cooperativeGestures: true }, (map) => installSourceLayers(map, airports));
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    return bindSourceInteractions(map, (id) => router.push(`/airports/${encodeURIComponent(id)}`));
  }, [ready, mapRef, router]);
  return (
    <div className="relative h-72 overflow-hidden rounded-xl border border-border bg-surface-2 sm:h-96">
      <div ref={el} className="absolute inset-0" style={{ position: "absolute" }} role="application" aria-label="World map of airports, colored by delays" />
    </div>
  );
}
