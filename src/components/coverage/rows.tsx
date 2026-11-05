import Link from "next/link";
import { ModeIcon } from "@/components/ui/icons";
import { HealthBadge, Pill } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";

export interface ExplorerRow {
  id: string; name: string; city: string | null; country: string; region: string;
  health: "live" | "stale" | "failing" | "pending";
  modes: string[]; counts: Record<string, number>;
  lastSuccessAt: string | null; intervalMinutes: number; lastDurationMs?: number | null; lastError?: string | null;
  kind?: string;
}

/** Only the fields the explorer renders, so thousands of rows stay a small payload. */
export const toRow = (s: ExplorerRow): ExplorerRow => ({
  id: s.id, name: s.name, city: s.city, country: s.country, region: s.region, health: s.health, modes: s.modes,
  counts: s.counts, lastSuccessAt: s.lastSuccessAt, intervalMinutes: s.intervalMinutes, kind: s.kind,
  ...(s.lastDurationMs !== undefined ? { lastDurationMs: s.lastDurationMs } : {}),
  ...(s.lastError ? { lastError: s.lastError.slice(0, 200) } : {}),
});

export function CoverageRow({ s }: { s: ExplorerRow }) {
  const counts = Object.entries(s.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n.toLocaleString("en-US")} ${k}`).join(", ");
  return (
    <Link href={`/n/${encodeURIComponent(s.id)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-2">
      <span className="min-w-0 flex-1 basis-48 truncate text-sm">{s.city ? `${s.city} · ` : ""}{s.name}</span>
      <span className="flex items-center gap-1 text-muted">{s.modes.slice(0, 5).map((m) => <ModeIcon key={m} mode={m} size={14} />)}</span>
      <span className="num w-44 text-xs text-muted">{counts || "no records"}</span>
      {s.kind === "schedule" ? (
        <><span className="w-16" /><Pill tone="unknown" title="Published timetable, no live feed">Timetable</Pill></>
      ) : (
        <><TimeAgo iso={s.lastSuccessAt} className="num w-16 text-xs text-muted" /><HealthBadge health={s.health} /></>
      )}
    </Link>
  );
}

export function StatusRow({ s }: { s: ExplorerRow }) {
  return (
    <Link href={`/n/${encodeURIComponent(s.id)}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_5rem_3.5rem_3.5rem]">
      <span className="min-w-0 truncate text-sm">{s.city ? `${s.city} · ` : ""}{s.name}</span>
      <span className="justify-self-end sm:justify-self-start"><HealthBadge health={s.health} /></span>
      <TimeAgo iso={s.lastSuccessAt} className="num text-xs text-muted" />
      <span className="num hidden text-right text-xs text-muted sm:block">{s.intervalMinutes} min</span>
      <span className="num hidden text-right text-xs text-muted sm:block">{s.lastDurationMs != null ? `${(s.lastDurationMs / 1000).toFixed(1)} s` : "-"}</span>
      {s.health !== "live" && s.lastError && <span className="col-span-full truncate text-xs text-muted" title={s.lastError}>{s.lastError}</span>}
    </Link>
  );
}
