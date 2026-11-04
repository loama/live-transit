"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { CoverageRow, StatusRow, type ExplorerRow } from "./rows";
import { countryName, flag, nf, REGION_LABEL } from "@/components/ui/format";

type Health = ExplorerRow["health"];
const CHIPS: Health[] = ["live", "stale", "failing", "pending"];
const DOT: Record<Health, string> = { live: "bg-good", stale: "bg-minor", failing: "bg-severe", pending: "bg-unknown" };

function group<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const i of items) (m.get(key(i)) ?? m.set(key(i), []).get(key(i))!).push(i);
  return m;
}

export function SourceExplorer({ rows, variant }: { rows: ExplorerRow[]; variant: "coverage" | "status" }) {
  const [q, setQ] = useState("");
  const [on, setOn] = useState<Set<Health>>(new Set());
  const dq = useDeferredValue(q).trim().toLowerCase();
  const Row = variant === "status" ? StatusRow : CoverageRow;
  const counts = useMemo(() => {
    const c = { live: 0, stale: 0, failing: 0, pending: 0 };
    for (const r of rows) c[r.health]++;
    return c;
  }, [rows]);
  const hay = useMemo(() => new Map(rows.map((r) => [r.id, `${r.name} ${r.city ?? ""} ${countryName(r.country)} ${r.country} ${r.id}`.toLowerCase()])), [rows]);
  const shown = useMemo(
    () => rows.filter((r) => (!on.size || on.has(r.health)) && (!dq || hay.get(r.id)!.includes(dq))),
    [rows, on, dq, hay],
  );
  const regions = useMemo(
    () => [...group(shown, (r) => r.region)].sort((a, b) => b[1].length - a[1].length),
    [shown],
  );
  const active = Boolean(dq) || on.size > 0;
  const toggle = (h: Health) => setOn((p) => { const n = new Set(p); if (!n.delete(h)) n.add(h); return n; });

  return (
    <div>
      <div className="sticky top-14 z-30 -mx-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, city or country"
            aria-label="Filter sources" className="h-9 min-w-0 flex-1 basis-56 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          />
          {CHIPS.map((h) => (
            <button key={h} type="button" aria-pressed={on.has(h)} onClick={() => toggle(h)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm capitalize ${on.has(h) ? "border-fg bg-surface-2 text-fg" : "border-border text-muted hover:text-fg"}`}>
              <span aria-hidden className={`size-2 rounded-full ${DOT[h]}`} />{h} <span className="num text-faint">{counts[h]}</span>
            </button>
          ))}
        </div>
        <p className="num mt-2 text-xs text-muted" role="status">
          Showing <b className="text-fg">{nf.format(shown.length)}</b> of {nf.format(rows.length)} sources in {regions.length} {regions.length === 1 ? "region" : "regions"}
        </p>
      </div>
      {shown.length === 0 && <p className="py-12 text-center text-sm text-muted">No sources match this filter.</p>}
      <div className="space-y-3 py-4">
        {regions.map(([region, list]) => {
          const bad = list.filter((r) => r.health === "failing" || r.health === "stale").length;
          const countries = [...group(list, (r) => r.country)].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0])));
          return (
            <details key={`${region}-${active}`} id={region} open={active || (variant === "status" && bad > 0)} className="group scroll-mt-32 rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer select-none items-baseline gap-3 px-4 py-3 text-lg font-semibold tracking-tight">
                <span aria-hidden className="text-sm text-faint transition-transform group-open:rotate-90">&#9656;</span>
                {REGION_LABEL[region] ?? region}
                <span className="num text-sm font-normal text-muted">{list.length} sources, {countries.length} countries</span>
                {bad > 0 && <span className="num ml-auto text-sm font-normal text-minor">{bad} need attention</span>}
              </summary>
              <div className="border-t border-border">
                {countries.map(([cc, cl]) => (
                  <details key={cc} open className="group/c border-b border-border last:border-0">
                    <summary className="flex cursor-pointer select-none items-center gap-2 bg-surface-2/50 px-4 py-2 text-sm font-medium">
                      <span aria-hidden className="text-xs text-faint transition-transform group-open/c:rotate-90">&#9656;</span>
                      <span aria-hidden>{flag(cc)}</span> {countryName(cc)}
                      <span className="num text-xs font-normal text-muted">{cl.length}</span>
                    </summary>
                    <ul>{cl.map((s) => <li key={s.id} className="border-t border-border"><Row s={s} /></li>)}</ul>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
