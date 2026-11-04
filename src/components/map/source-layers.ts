import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, Popup } from "maplibre-gl";
import { TONE_VAR, type Tone } from "@/components/ui/status";

// Clustered network dots colored by health, shared by the home map and the live map explorer.

export interface MapSource {
  id: string; name: string; city: string | null; lat: number; lon: number; tone: Tone; note: string;
}

/** Severity order used to color a cluster by its worst member. */
const RANK: Record<Tone, number> = { good: 0, unknown: 1, minor: 2, major: 3, severe: 4 };
const RANKED: Tone[] = ["good", "unknown", "minor", "major", "severe"];

export const SOURCE_LAYERS = ["src-halo", "src-dots", "src-clusters", "src-count"] as const;

export function sourcesGeo(sources: MapSource[]) {
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
  const name = TONE_VAR[t].slice(4, -1);
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function installSourceLayers(map: MlMap, sources: MapSource[]) {
  const colors = ["match", ["get", "tone"], ...(["good", "minor", "major", "severe"] as Tone[]).flatMap((t) => [t, readVar(t)]), readVar("unknown")];
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
  const solo = ["!", ["has", "point_count"]];
  const worst = ["step", ["get", "worst"], readVar("good"), ...RANKED.slice(1).flatMap((t, i) => [i + 1, readVar(t)])];
  map.addSource("sources", { type: "geojson", data: sourcesGeo(sources), cluster: true, clusterRadius: 42, clusterMaxZoom: 6,
    clusterProperties: { worst: ["max", ["get", "rank"]] } });
  map.addLayer({ id: "src-halo", type: "circle", source: "sources", filter: solo as never,
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 7, 8, 14], "circle-color": colors as never, "circle-opacity": 0.2 } });
  map.addLayer({ id: "src-dots", type: "circle", source: "sources", filter: solo as never,
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3.5, 8, 7], "circle-color": colors as never,
      "circle-stroke-width": 1.5, "circle-stroke-color": surface } });
  map.addLayer({ id: "src-clusters", type: "circle", source: "sources", filter: ["has", "point_count"],
    paint: { "circle-color": worst as never, "circle-opacity": 0.9, "circle-stroke-width": 2, "circle-stroke-color": surface,
      "circle-radius": ["step", ["get", "point_count"], 12, 5, 15, 15, 19, 40, 24] } });
  map.addLayer({ id: "src-count", type: "symbol", source: "sources", filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
    paint: { "text-color": "#ffffff" } });
}

export function setSources(map: MlMap | null, sources: MapSource[]) {
  (map?.getSource("sources") as GeoJSONSource | undefined)?.setData(sourcesGeo(sources));
}

/** Hover a network for its name and state, click to open it; click a cluster to zoom in. Returns an unbind function. */
export function bindSourceInteractions(map: MlMap, open: (id: string) => void): () => void {
  let popup: Popup | undefined;
  const enter = async (e: MapLayerMouseEvent) => {
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
  const click = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id;
    if (id) open(String(id));
  };
  const expand = async (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return;
    const zoom = await (map.getSource("sources") as GeoJSONSource).getClusterExpansionZoom(Number(f.properties.cluster_id));
    map.easeTo({ center: f.geometry.coordinates as [number, number], zoom: zoom + 0.5 });
  };
  const over = () => { map.getCanvas().style.cursor = "pointer"; };
  const out = () => { map.getCanvas().style.cursor = ""; };
  map.on("click", "src-clusters", expand);
  map.on("mouseenter", "src-clusters", over);
  map.on("mouseleave", "src-clusters", out);
  map.on("mousemove", "src-dots", enter);
  map.on("mouseleave", "src-dots", leave);
  map.on("click", "src-dots", click);
  return () => {
    map.off("click", "src-clusters", expand);
    map.off("mouseenter", "src-clusters", over);
    map.off("mouseleave", "src-clusters", out);
    map.off("mousemove", "src-dots", enter);
    map.off("mouseleave", "src-dots", leave);
    map.off("click", "src-dots", click);
    popup?.remove();
  };
}
