"use client";
import { useEffect, useRef, useState } from "react";
import type { MapVehicle } from "./transit-layers";

export interface LiveState {
  vehicles: MapVehicle[];
  /** True when the last update came straight from the operator's feed rather than our snapshot. */
  live: boolean;
  updatedAt: number | null;
  error: boolean;
}

/**
 * Polls a vehicles endpoint (`{ data, meta: { live? } }`) while the tab is visible, and right away when
 * it becomes visible again. Pass url null to pause.
 */
export function useLiveVehicles(url: string | null, intervalMs: number, initial: MapVehicle[] = []): LiveState {
  const [state, setState] = useState<LiveState>({ vehicles: initial, live: false, updatedAt: null, error: false });
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) return;
    let stopped = false;
    const tick = async () => {
      if (document.hidden || stopped) return;
      inflight.current?.abort();
      const ac = new AbortController();
      inflight.current = ac;
      try {
        const r = await fetch(url, { signal: ac.signal });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { data: MapVehicle[]; meta: { live?: boolean } };
        if (!stopped) setState({ vehicles: j.data, live: !!j.meta.live, updatedAt: Date.now(), error: false });
      } catch (e) {
        if (!stopped && (e as Error).name !== "AbortError") setState((s) => ({ ...s, error: true }));
      }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
      inflight.current?.abort();
    };
  }, [url, intervalMs]);

  return state;
}
