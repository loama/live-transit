"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MlMap, MapOptions } from "maplibre-gl";

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const isDark = () => document.documentElement.classList.contains("dark");

/**
 * Creates a MapLibre map client-side only, keeps its basemap in sync with the site theme,
 * and reports `ready` once the style has loaded (safe point to add sources and layers).
 * `onStyle` runs after every style load, including theme switches.
 */
export function useMap(
  el: RefObject<HTMLDivElement | null>,
  options: Omit<MapOptions, "container" | "style">,
  onStyle: (map: MlMap) => void,
) {
  const mapRef = useRef<MlMap | null>(null);
  const styleCb = useRef(onStyle);
  const [ready, setReady] = useState(false);
  useEffect(() => { styleCb.current = onStyle; });

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | undefined;
    (async () => {
      const ml = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      // Bundlers relocate the default worker; serve a copy of the package worker from /public (same version as maplibre-gl).
      ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      if (cancelled || !el.current) return;
      let dark = isDark();
      const map = new ml.Map({
        container: el.current,
        style: dark ? STYLE.dark : STYLE.light,
        attributionControl: { compact: true },
        ...options,
      });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.on("style.load", () => { styleCb.current(map); setReady(true); });
      observer = new MutationObserver(() => {
        if (isDark() !== dark) {
          dark = isDark();
          map.setStyle(dark ? STYLE.dark : STYLE.light);
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    })().catch((e) => console.error("map init failed", e));
    return () => {
      cancelled = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // The map is created once; options are initial values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mapRef, ready };
}
