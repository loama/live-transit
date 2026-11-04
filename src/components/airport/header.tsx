import Link from "next/link";
import type { getStationById } from "@/data/cached";
import { StatusPill } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";
import { countryName, flag } from "@/components/ui/format";

type Airport = NonNullable<Awaited<ReturnType<typeof getStationById>>>;

export function AirportHeader({ a, iata, count }: { a: Airport; iata: string; count: number }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-border pb-6 pt-8 sm:pt-12">
      <div className="min-w-0">
        <p className="mb-2 text-sm text-muted"><span aria-hidden>{flag(a.country)}</span> {a.city ? `${a.city}, ` : ""}{countryName(a.country)}</p>
        <h1 className="flex flex-wrap items-baseline gap-x-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          <span className="font-mono tracking-widest">{iata}</span>
          <span className="text-balance text-xl font-medium text-muted sm:text-2xl">{a.name}</span>
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <StatusPill status={a.status} delayMinutes={a.delayMinutes ?? 0} label={a.delayMinutes ? `Delays ~${a.delayMinutes} min` : undefined} />
          {a.statusText && <span>{a.statusText}</span>}
          <span>Updated <TimeAgo iso={a.updatedAt} className="num font-medium text-fg" /></span>
        </p>
      </div>
      <p className="text-sm text-muted">
        {count} flights on the board. Source:{" "}
        {a.reports.map((r, i) => (
          <span key={r.sourceId}>{i > 0 && ", "}<Link href={`/n/${encodeURIComponent(r.sourceId)}`} className="text-accent hover:underline">{r.sourceName ?? r.sourceId}</Link></span>
        ))}
      </p>
    </header>
  );
}
