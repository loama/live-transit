"use client";
import { useEffect, useMemo, useState } from "react";
import { ModeIcon } from "@/components/ui/icons";
import { MODE_LABEL } from "@/components/ui/format";

export interface Place { id: string; name: string; city: string | null; lat: number; lon: number }

const MODES = ["bus", "tram", "metro", "rail", "ferry", "cable"];
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MapControls({ showVehicles, vehicleCount, updatedAt, error, modes, onModeToggle, places, onFly }: {
  showVehicles: boolean;
  vehicleCount: number;
  updatedAt: number | null;
  error: boolean;
  modes: Set<string>;
  onModeToggle: (mode: string) => void;
  places: Place[];
  onFly: (lat: number, lon: number, zoom?: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const matches = useMemo(() => {
    const q = fold(search.trim());
    if (!q) return [];
    return places.filter((p) => fold(`${p.name} ${p.city ?? ""}`).includes(q)).slice(0, 8);
  }, [search, places]);

  const locate = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) return setGeoError("Location is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (p) => onFly(p.coords.latitude, p.coords.longitude, 13),
      (e) => setGeoError(e.code === e.PERMISSION_DENIED ? "Location permission was denied." : "Could not get your location."),
      { timeout: 10_000 },
    );
  };

  const age = updatedAt && now ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-fg bg-fg text-bg" : "border-border bg-surface text-muted hover:text-fg"}`;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 w-[min(20rem,calc(100%-4.5rem))]">
      <div className="pointer-events-auto rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${error ? "bg-minor" : "live-dot bg-good"}`} />
          <p className="min-w-0 flex-1 truncate text-sm" aria-live="polite">
            {showVehicles ? (
              <>
                <b className="num font-semibold">{vehicleCount.toLocaleString("en-US")}</b> vehicles in view
                {error ? <span className="text-minor">, update failed</span> : age !== null && <span className="num text-muted"> · {age < 2 ? "just now" : `${age}s ago`}</span>}
              </>
            ) : (
              <span className="text-muted">Zoom into a city to see live vehicles</span>
            )}
          </p>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="map-panel"
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg md:hidden">
            {open ? "Hide" : "Filters"}
          </button>
        </div>
        <div id="map-panel" className={`${open ? "block" : "hidden"} space-y-3 border-t border-border px-3 pb-3 pt-2.5 md:block`}>
          <div className="relative">
            <label htmlFor="map-search" className="sr-only">Find a city or network</label>
            <input id="map-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off"
              placeholder="Find a city or network"
              onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { onFly(matches[0].lat, matches[0].lon); setSearch(""); } }}
              className="h-9 w-full rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-faint" />
            {matches.length > 0 && (
              <ul className="absolute inset-x-0 top-10 z-20 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => { onFly(p.lat, p.lon); setSearch(""); }} className="block w-full px-3 py-2 text-left hover:bg-surface-2">
                      <span className="block truncate text-sm font-medium">{p.city ?? p.name}</span>
                      {p.city && <span className="block truncate text-xs text-muted">{p.name}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div role="group" aria-label="Show only these modes" className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button key={m} type="button" onClick={() => onModeToggle(m)} aria-pressed={modes.has(m)} className={chip(modes.has(m))}>
                <ModeIcon mode={m} size={12} />{MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <div>
            <button type="button" onClick={locate} className="w-full rounded-lg border border-border bg-surface-2 py-1.5 text-sm font-medium hover:text-fg">
              Show vehicles near me
            </button>
            {geoError && <p role="status" className="mt-1.5 text-xs text-minor">{geoError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
