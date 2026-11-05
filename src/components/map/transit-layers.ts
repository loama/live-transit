import type { GeoJSONSource, Map as MlMap, MapGeoJSONFeature, Popup } from "maplibre-gl";
import { decodePolyline } from "@/lib/polyline";

// Shared MapLibre layers for transit: route geometry and live vehicles, with smooth movement between
// updates. Everything here runs client-side only.

export interface MapRoute {
  sourceId: string;
  routeId: string;
  name: string;
  mode: string;
  color: string | null;
  shapes?: string[];
}

export interface MapVehicle {
  sourceId: string;
  id: string;
  mode: string;
  routeId: string | null;
  routeName: string | null;
  headsign: string | null;
  label: string | null;
  color: string | null;
  lat: number;
  lon: number;
  bearing: number | null;
  speed: number | null;
  delaySeconds: number | null;
  observedAt: string | null;
}

const PALETTE = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#65a30d", "#c026d3", "#0d9488", "#ea580c", "#4f46e5"];

/** Operator color when published, else a stable color picked from the route id. */
export function routeColor(color: string | null | undefined, key: string): string {
  if (color && /^[0-9a-f]{6}$/i.test(color)) return `#${color}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export interface MapStop { sourceId: string; name: string; lat: number; lon: number }

export function stopsGeo(stops: MapStop[]) {
  return {
    type: "FeatureCollection" as const,
    features: stops.map((s) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] }, properties: { name: s.name } })),
  };
}

export function setStops(map: MlMap | null, stops: MapStop[]) {
  (map?.getSource("stops") as GeoJSONSource | undefined)?.setData(stopsGeo(stops));
}

export const lineKey = (sourceId: string, routeId: string | null | undefined) => `${sourceId}|${routeId ?? ""}`;

const MODE_RANK: Record<string, number> = { rail: 5, metro: 4, tram: 3, ferry: 2, cable: 2, bus: 1 };

export function routesGeo(routes: MapRoute[]) {
  return {
    type: "FeatureCollection" as const,
    features: routes.flatMap((r) =>
      (r.shapes ?? []).map((s) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: decodePolyline(s) },
        properties: { key: lineKey(r.sourceId, r.routeId), name: r.name, mode: r.mode, color: routeColor(r.color, r.routeId), rank: MODE_RANK[r.mode] ?? 0 },
      })),
    ),
  };
}

export function vehiclesGeo(vs: MapVehicle[], pos?: Map<string, [number, number]>) {
  return {
    type: "FeatureCollection" as const,
    features: vs.map((v) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: pos?.get(`${v.sourceId}|${v.id}`) ?? [v.lon, v.lat] },
      properties: {
        vid: `${v.sourceId}|${v.id}`,
        key: lineKey(v.sourceId, v.routeId),
        name: v.routeName ?? "",
        mode: v.mode,
        color: routeColor(v.color, v.routeId ?? v.id),
        bearing: v.bearing ?? -1,
      },
    })),
  };
}

function arrowImage(): ImageData {
  const n = 32;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.beginPath();
  g.moveTo(n / 2, 2);
  g.lineTo(n - 7, n - 9);
  g.lineTo(n / 2, n - 14);
  g.lineTo(7, n - 9);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, n, n);
}

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Add route and vehicle sources/layers. Call from the map's style-load callback. */
export function installTransitLayers(map: MlMap, init: { routes?: MapRoute[]; vehicles?: MapVehicle[]; stops?: MapStop[] } = {}) {
  const surface = css("--surface", "#fff");
  const fg = css("--fg", "#151513");
  if (!map.hasImage("veh-arrow")) map.addImage("veh-arrow", arrowImage(), { sdf: true, pixelRatio: 2 });
  map.addSource("routes", { type: "geojson", data: routesGeo(init.routes ?? []), tolerance: 0.4 });
  map.addSource("veh", { type: "geojson", data: vehiclesGeo(init.vehicles ?? []) });
  // Zoom must be the outermost input, so the casing offset is applied at every stop.
  const width = (extra: number) => ["interpolate", ["linear"], ["zoom"],
    6, ["+", extra, ["*", 0.6, ["max", 1, ["/", ["get", "rank"], 2]]]],
    12, ["+", extra + 1.5, ["/", ["get", "rank"], 2]],
    16, ["+", extra + 3, ["get", "rank"]]];
  map.addLayer({ id: "routes-casing", type: "line", source: "routes", layout: { "line-join": "round", "line-cap": "round", "line-sort-key": ["get", "rank"] },
    paint: { "line-color": surface, "line-width": width(2) as never, "line-opacity": 0.7 } });
  map.addLayer({ id: "routes-line", type: "line", source: "routes", layout: { "line-join": "round", "line-cap": "round", "line-sort-key": ["get", "rank"] },
    paint: { "line-color": ["get", "color"], "line-width": width(0) as never, "line-opacity": 0.85 } });
  map.addLayer({ id: "routes-label", type: "symbol", source: "routes", minzoom: 13,
    layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-size": 11, "text-font": ["Noto Sans Bold"], "symbol-spacing": 400 },
    paint: { "text-color": ["get", "color"], "text-halo-color": surface, "text-halo-width": 2 } });
  map.addSource("stops", { type: "geojson", data: stopsGeo(init.stops ?? []) });
  map.addLayer({ id: "stops-dot", type: "circle", source: "stops", minzoom: 13.5, paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 13.5, 2, 17, 4.5], "circle-color": surface,
    "circle-stroke-color": fg, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13.5, 0.8, 17, 1.5], "circle-stroke-opacity": 0.6,
  } });
  map.addLayer({ id: "stops-label", type: "symbol", source: "stops", minzoom: 15.5,
    layout: { "text-field": ["get", "name"], "text-size": 10.5, "text-font": ["Noto Sans Regular"], "text-offset": [0, 0.9], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": fg, "text-halo-color": surface, "text-halo-width": 1.5, "text-opacity": 0.8 } });
  map.addLayer({ id: "veh-dot", type: "circle", source: "veh", paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 10, 3.5, 14, 6.5, 17, 9],
    "circle-color": ["get", "color"], "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 1.6], "circle-stroke-color": surface,
  } });
  map.addLayer({ id: "veh-arrow", type: "symbol", source: "veh", minzoom: 12.5, filter: [">=", ["get", "bearing"], 0],
    layout: { "icon-image": "veh-arrow", "icon-size": ["interpolate", ["linear"], ["zoom"], 12.5, 0.55, 17, 0.9], "icon-rotate": ["get", "bearing"],
      "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-offset": [0, -15] },
    paint: { "icon-color": ["get", "color"], "icon-halo-color": surface, "icon-halo-width": 1 } });
  map.addLayer({ id: "veh-label", type: "symbol", source: "veh", minzoom: 14.5,
    layout: { "text-field": ["get", "name"], "text-size": 10, "text-font": ["Noto Sans Bold"], "text-offset": [0, 1.3], "text-optional": true },
    paint: { "text-color": fg, "text-halo-color": surface, "text-halo-width": 1.5 } });
}

export function setRoutes(map: MlMap | null, routes: MapRoute[]) {
  (map?.getSource("routes") as GeoJSONSource | undefined)?.setData(routesGeo(routes));
}

/** Dim everything but one line (`key` from lineKey), or clear with null. */
export function highlightLine(map: MlMap | null, key: string | null) {
  if (!map?.getLayer("routes-line")) return;
  const on = (a: number, b: number) => (key ? ["case", ["==", ["get", "key"], key], a, b] : a);
  map.setPaintProperty("routes-line", "line-opacity", on(1, 0.12) as never);
  map.setPaintProperty("routes-casing", "line-opacity", on(0.9, 0) as never);
  map.setPaintProperty("veh-dot", "circle-opacity", on(1, 0.15) as never);
  map.setPaintProperty("veh-dot", "circle-stroke-opacity", on(1, 0.15) as never);
  map.setPaintProperty("veh-arrow", "icon-opacity", on(1, 0) as never);
}

/**
 * Moves vehicle dots from where they were to their new positions over `ms`, instead of jumping.
 * Returns a cancel function. Skips the animation for reduced-motion users or very large fleets.
 */
export function tweenVehicles(map: MlMap, prev: Map<string, [number, number]>, next: MapVehicle[], ms = 1500): () => void {
  const src = map.getSource("veh") as GeoJSONSource | undefined;
  if (!src) return () => {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || next.length > 4000 || prev.size === 0) {
    src.setData(vehiclesGeo(next));
    return () => {};
  }
  const from = next.map((v) => prev.get(`${v.sourceId}|${v.id}`) ?? [v.lon, v.lat]);
  const t0 = performance.now();
  let raf = 0;
  const pos = new Map<string, [number, number]>();
  const frame = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    next.forEach((v, i) => {
      const [x, y] = from[i];
      pos.set(`${v.sourceId}|${v.id}`, [x + (v.lon - x) * e, y + (v.lat - y) * e]);
    });
    src.setData(vehiclesGeo(next, pos));
    if (k < 1) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export const positionsOf = (vs: MapVehicle[]) => new Map(vs.map((v) => [`${v.sourceId}|${v.id}`, [v.lon, v.lat] as [number, number]]));

function fmtDelay(s: number | null) {
  if (s == null) return null;
  const m = Math.round(s / 60);
  if (Math.abs(m) < 1) return "On time";
  return m > 0 ? `${m} min late` : `${-m} min early`;
}

/** Popup body for a vehicle, built with textContent so feed strings are never parsed as HTML. */
export function vehiclePopupNode(v: MapVehicle, extra?: { network?: string; href?: string }): HTMLElement {
  const box = document.createElement("div");
  box.style.cssText = "font:12px/1.45 system-ui;color:#151513;min-width:140px";
  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:6px;font-weight:600";
  const sw = document.createElement("span");
  sw.style.cssText = `width:10px;height:10px;border-radius:9999px;background:${routeColor(v.color, v.routeId ?? v.id)}`;
  head.append(sw, document.createTextNode(v.routeName ? `Line ${v.routeName}` : "Vehicle"));
  box.append(head);
  const rows = [
    v.headsign && `To ${v.headsign}`,
    extra?.network,
    fmtDelay(v.delaySeconds),
    v.speed != null && v.speed > 0.5 ? `${Math.round(v.speed * 3.6)} km/h` : null,
    v.label && `Vehicle ${v.label}`,
    v.observedAt && `Position ${Math.max(0, Math.round((Date.now() - Date.parse(v.observedAt)) / 1000))}s old`,
  ].filter(Boolean) as string[];
  for (const r of rows) {
    const d = document.createElement("div");
    d.style.color = "#5c5c56";
    d.textContent = r;
    box.append(d);
  }
  if (extra?.href) {
    const a = document.createElement("a");
    a.href = extra.href;
    a.textContent = "Line details →";
    a.style.cssText = "display:inline-block;margin-top:4px;color:#1d4ed8";
    box.append(a);
  }
  return box;
}

/**
 * Click a vehicle for its details popup; hover any line or vehicle for a pointer. `lookup` resolves the
 * clicked feature back to the full vehicle. Returns an unbind function.
 */
export function bindVehiclePopups(
  map: MlMap,
  lookup: (vid: string) => MapVehicle | undefined,
  extra?: (v: MapVehicle) => { network?: string; href?: string },
  onLineClick?: (key: string) => void,
): () => void {
  let popup: Popup | undefined;
  const click = async (e: { features?: MapGeoJSONFeature[]; lngLat: { lng: number; lat: number } }) => {
    const v = lookup(String(e.features?.[0]?.properties?.vid));
    if (!v) return;
    const ml = await import("maplibre-gl");
    popup?.remove();
    popup = new ml.Popup({ closeButton: true, offset: 10, maxWidth: "260px" }).setLngLat(e.lngLat).setDOMContent(vehiclePopupNode(v, extra?.(v))).addTo(map);
  };
  const lineClick = (e: { features?: MapGeoJSONFeature[]; point: { x: number; y: number } }) => {
    // A vehicle sitting on the line takes the click.
    if (map.queryRenderedFeatures([e.point.x, e.point.y], { layers: ["veh-dot"] }).length) return;
    const k = e.features?.[0]?.properties?.key;
    if (k && onLineClick) onLineClick(String(k));
  };
  const over = () => (map.getCanvas().style.cursor = "pointer");
  const out = () => (map.getCanvas().style.cursor = "");
  map.on("click", "veh-dot", click);
  map.on("click", "routes-line", lineClick);
  for (const l of ["veh-dot", "routes-line"]) {
    map.on("mouseenter", l, over);
    map.on("mouseleave", l, out);
  }
  return () => {
    map.off("click", "veh-dot", click);
    map.off("click", "routes-line", lineClick);
    for (const l of ["veh-dot", "routes-line"]) {
      map.off("mouseenter", l, over);
      map.off("mouseleave", l, out);
    }
    popup?.remove();
  };
}
