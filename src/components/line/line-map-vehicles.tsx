"use client";
import { useEffect, useRef, useState } from "react";
import type { getLine } from "@/data/cached";
import { Empty, Section } from "@/components/ui/section";
import { LiveBadge } from "@/components/ui/live-badge";
import { useMap } from "@/components/map/use-map";
import { useLiveVehicles } from "@/components/map/use-live-vehicles";
import { bindVehiclePopups, installTransitLayers, positionsOf, tweenVehicles, type MapVehicle } from "@/components/map/transit-layers";
import { bboxOf, decodePolyline } from "@/lib/polyline";

type Line = NonNullable<Awaited<ReturnType<typeof getLine>>>;

function fmtDelay(s: number | null) {
  if (s == null) return null;
  const m = Math.round(s / 60);
  if (Math.abs(m) < 1) return "On time";
  return m > 0 ? `${m} min late` : `${-m} min early`;
}

const fmtSpeed = (speed: number | null) => (speed == null || speed < 0.5 ? null : `${Math.round(speed * 3.6)} km/h`);

function fmtAge(iso: string | null, now: number) {
  if (!iso) return null;
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 10 ? "just now" : s < 90 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

function VehicleList({ vehicles, now }: { vehicles: MapVehicle[]; now: number }) {
  if (!vehicles.length) return <Empty>No vehicles reporting on this line right now.</Empty>;
  return (
    <ul className="max-h-96 overflow-y-auto rounded-xl border border-border bg-surface lg:max-h-[30rem]">
      {vehicles.map((v) => {
        const delay = fmtDelay(v.delaySeconds);
        return (
          <li key={v.id} className="border-b border-border px-4 py-2.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium">{v.headsign ? `To ${v.headsign}` : "In service"}</p>
              {v.label && <span className="num shrink-0 text-xs text-muted">Vehicle {v.label}</span>}
            </div>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
              {delay && <span className={v.delaySeconds && v.delaySeconds >= 300 ? "text-major" : ""}>{delay}</span>}
              {fmtSpeed(v.speed) && <span>{fmtSpeed(v.speed)}</span>}
              {v.observedAt && <span suppressHydrationWarning>Position {fmtAge(v.observedAt, now)}</span>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function LineMapAndVehicles({ line, realtime }: { line: Line; realtime: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const url = `/api/v1/sources/${encodeURIComponent(line.sourceId)}/live?routeId=${encodeURIComponent(line.lineId)}`;
  const live = useLiveVehicles(url, 10_000, line.vehicles);
  const shown = useRef<MapVehicle[]>(line.vehicles);
  const cancelTween = useRef<() => void>(() => {});
  const hasMap = line.shapes.length > 0 || line.vehicles.length > 0;
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const { mapRef, ready } = useMap(el, { center: [0, 0], zoom: 1, cooperativeGestures: true }, (map) => {
    const routes = line.shapes.length ? [{ sourceId: line.sourceId, routeId: line.lineId, name: line.name, mode: line.mode, color: line.color, shapes: line.shapes }] : [];
    installTransitLayers(map, { routes, vehicles: shown.current });
    const b = bboxOf(line.shapes.length ? line.shapes.map(decodePolyline) : [shown.current.map((v) => [v.lon, v.lat] as [number, number])]);
    if (b) map.fitBounds([[b.minLon, b.minLat], [b.maxLon, b.maxLat]], { padding: 40, maxZoom: 14, duration: 0 });
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || live.updatedAt === null) return;
    cancelTween.current();
    cancelTween.current = tweenVehicles(map, positionsOf(shown.current), live.vehicles);
    shown.current = live.vehicles;
  }, [ready, live.updatedAt, live.vehicles, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    return bindVehiclePopups(map, (vid) => shown.current.find((v) => `${v.sourceId}|${v.id}` === vid));
  }, [ready, mapRef]);

  const hint = <LiveBadge count={live.vehicles.length} live={live.live} realtime={realtime} updatedAt={live.updatedAt} error={live.error} />;
  return (
    <Section title="Live vehicles" hint={hint}>
      {hasMap ? (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="relative h-80 overflow-hidden rounded-xl border border-border bg-surface-2 sm:h-[30rem]">
            <div ref={el} className="absolute inset-0" style={{ position: "absolute" }} role="application" aria-label={`Map of line ${line.name} with live vehicle positions`} />
          </div>
          <VehicleList vehicles={live.vehicles} now={live.updatedAt ?? now} />
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">The operator does not publish route geometry for this line.</p>
          <VehicleList vehicles={live.vehicles} now={live.updatedAt ?? now} />
        </>
      )}
    </Section>
  );
}
