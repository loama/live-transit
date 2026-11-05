"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Section } from "@/components/ui/section";
import { StatusPill, lineTone } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";
import { MODE_LABEL } from "@/components/ui/format";

export interface SlimLine {
  lineId: string;
  lineName: string;
  longName: string | null;
  mode: string;
  color: string | null;
  status: string;
  statusText: string;
  since: string;
  vehicles: number;
  /** [minLon, minLat, maxLon, maxLat], when the line has geometry. */
  bbox?: [number, number, number, number];
}

const PAGE = 60;
const QUIET = /^(no disruptions reported|no alert feed published|normal service|good service)$/i;

export function LineBadge({ name, color, className = "" }: { name: string; color: string | null; className?: string }) {
  const bg = color && /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : null;
  const light = bg ? luminance(bg) > 0.6 : false;
  return (
    <span
      className={`inline-flex h-6 min-w-6 max-w-28 shrink-0 items-center justify-center truncate rounded-md px-1.5 text-xs font-bold ${bg ? "" : "bg-surface-2 text-fg ring-1 ring-border-strong ring-inset"} ${className}`}
      style={bg ? { background: bg, color: light ? "#111" : "#fff" } : undefined}
    >
      {name}
    </span>
  );
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const rank = (s: string) => (lineTone(s) === "good" ? 2 : s === "unknown" ? 1 : 0);
const runningOf = (l: SlimLine, counts: Map<string, number> | null) => counts?.get(l.lineId) ?? l.vehicles;

export function LinesExplorer({ sourceId, lines, counts, onShowOnMap, selectedId }: {
  sourceId: string;
  lines: SlimLine[];
  /** Live vehicles per line id, once the first realtime update arrived. */
  counts: Map<string, number> | null;
  onShowOnMap?: (lineId: string) => void;
  selectedId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<string | null>(null);
  const [disrupted, setDisrupted] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const modes = useMemo(() => [...new Set(lines.map((l) => l.mode))].sort(), [lines]);
  const bad = useMemo(() => lines.filter((l) => rank(l.status) === 0).length, [lines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines
      .filter((l) => (!mode || l.mode === mode) && (!disrupted || rank(l.status) === 0)
        && (!q || l.lineName.toLowerCase().includes(q) || l.longName?.toLowerCase().includes(q) || l.lineId.toLowerCase() === q))
      .sort((a, b) => rank(a.status) - rank(b.status)
        || a.lineName.localeCompare(b.lineName, "en", { numeric: true }));
  }, [lines, query, mode, disrupted]);

  if (!lines.length) return null;
  const searchable = lines.length > 12;
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-fg bg-fg text-bg" : "border-border bg-surface text-muted hover:text-fg"}`;

  return (
    <Section
      title="Lines"
      hint={`${bad ? `${bad} of ${lines.length.toLocaleString("en-US")} lines have a service change.` : `${lines.length.toLocaleString("en-US")} lines, none with a reported disruption.`}${counts ? ` ${[...counts.values()].length} running now.` : ""}`}
    >
      {searchable && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search" value={query} placeholder="Find a line by number or name"
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            aria-label="Filter lines"
            className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-faint sm:w-72"
          />
          {modes.length > 1 && (
            <div role="group" aria-label="Filter by mode" className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(!mode)} aria-pressed={!mode} onClick={() => setMode(null)}>All</button>
              {modes.map((m) => (
                <button key={m} type="button" className={chip(mode === m)} aria-pressed={mode === m} onClick={() => { setMode(mode === m ? null : m); setLimit(PAGE); }}>
                  {MODE_LABEL[m] ?? m}
                </button>
              ))}
            </div>
          )}
          {bad > 0 && (
            <button type="button" className={chip(disrupted)} aria-pressed={disrupted} onClick={() => { setDisrupted(!disrupted); setLimit(PAGE); }}>
              Disrupted only ({bad})
            </button>
          )}
        </div>
      )}
      <Card>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No line matches that filter.</p>
        ) : (
          <ul className="grid sm:grid-cols-2">
            {filtered.slice(0, limit).map((l) => {
              const n = runningOf(l, counts);
              const note = l.statusText && !QUIET.test(l.statusText) && l.statusText.toLowerCase() !== l.status ? l.statusText : null;
              return (
                <li key={l.lineId} className={`flex items-center gap-3 border-b border-border px-4 py-2.5 ${selectedId === l.lineId ? "bg-surface-2" : ""}`}>
                  <LineBadge name={l.lineName} color={l.color} />
                  <Link href={`/n/${encodeURIComponent(sourceId)}/l/${encodeURIComponent(l.lineId)}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-sm font-medium">{l.longName && l.longName !== l.lineName ? l.longName : `${MODE_LABEL[l.mode] ?? l.mode} ${l.lineName}`}</p>
                    <p className="truncate text-xs text-muted">
                      {note ? `${note} · ` : ""}{n > 0 ? `${n} running · ` : ""}since <TimeAgo iso={l.since} />
                    </p>
                  </Link>
                  {onShowOnMap && (
                    <button type="button" onClick={() => onShowOnMap(l.lineId)} className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Show line ${l.lineName} on the map`}>
                      Map
                    </button>
                  )}
                  <StatusPill status={l.status} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {filtered.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE * 4)} className="mt-3 w-full rounded-lg border border-border bg-surface py-2 text-sm text-muted hover:text-fg">
          Show more ({(filtered.length - limit).toLocaleString("en-US")} left)
        </button>
      )}
    </Section>
  );
}
