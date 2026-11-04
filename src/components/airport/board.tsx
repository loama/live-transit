"use client";
import { useEffect, useMemo, useState } from "react";
import type { DepartureItem } from "@/db/queries";
import { BoardRow, flightTone } from "./board-row";

type Dir = "departure" | "arrival";

const Seg = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button type="button" role="tab" aria-selected={on} onClick={onClick}
    className={`rounded-md px-3 py-1.5 text-sm font-medium ${on ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}>
    {children}
  </button>
);

export function Board({ iata, initial }: { iata: string; initial: DepartureItem[] }) {
  const [rows, setRows] = useState(initial);
  const [dir, setDir] = useState<Dir>(initial.some((d) => d.direction === "departure") ? "departure" : "arrival");
  const [utc, setUtc] = useState(true);
  const [onlyBad, setOnlyBad] = useState(false);

  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/v1/stations/${encodeURIComponent(iata)}/board?limit=120`);
        if (r.ok) setRows((await r.json()).data as DepartureItem[]);
      } catch {}
    };
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [iata]);

  const shown = useMemo(
    () => rows.filter((d) => d.direction === dir && (!onlyBad || ["minor", "major", "severe"].includes(flightTone(d)))),
    [rows, dir, onlyBad],
  );
  const count = (x: Dir) => rows.filter((d) => d.direction === x).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Board direction" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          <Seg on={dir === "departure"} onClick={() => setDir("departure")}>Departures <span className="num opacity-60">{count("departure")}</span></Seg>
          <Seg on={dir === "arrival"} onClick={() => setDir("arrival")}>Arrivals <span className="num opacity-60">{count("arrival")}</span></Seg>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Only delayed or cancelled
        </label>
        <button type="button" onClick={() => setUtc((u) => !u)} className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-fg">
          Times in {utc ? "UTC" : "your local time"}. Switch
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-[3.5rem_4.5rem_1fr_auto] gap-x-3 border-b border-border bg-surface-2 px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-faint sm:grid-cols-[4rem_5.5rem_1fr_6rem_9rem] sm:px-4">
          <span>Time</span><span>Flight</span><span>{dir === "departure" ? "To" : "From"}</span>
          <span className="hidden text-center sm:block">Gate</span><span className="text-right">Status</span>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">{onlyBad ? "No delayed or cancelled flights right now." : "No flights on this board right now."}</p>
        ) : (
          <ul aria-live="polite">{shown.map((d) => <BoardRow key={d.id} d={d} utc={utc} />)}</ul>
        )}
      </div>
    </div>
  );
}
