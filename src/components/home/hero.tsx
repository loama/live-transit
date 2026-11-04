import type { getOverview } from "@/data/cached";
import { PaletteTrigger } from "@/components/layout/command-palette";
import { TimeAgo } from "@/components/ui/time-ago";
import { nf, pluralize } from "@/components/ui/format";

type Overview = Awaited<ReturnType<typeof getOverview>>;

export function Hero({ o }: { o: Overview }) {
  const empty = o.sources.live === 0;
  return (
    <div className="pb-6 pt-10 sm:pt-16">
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
        <span aria-hidden className="live-dot size-2 rounded-full bg-good" />
        {o.lastIngestAt ? <>Last update <TimeAgo iso={o.lastIngestAt} /></> : "Waiting for the first ingest"}
      </p>
      <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
        Every public transport network, live.
      </h1>
      <p className="mt-5 max-w-2xl text-pretty text-lg text-muted">
        {empty ? (
          "Sources are being connected. Check back in a minute."
        ) : (
          <>
            <b className="num font-semibold text-fg">{nf.format(o.sources.live)}</b> live {o.sources.live === 1 ? "source" : "sources"} in{" "}
            <b className="num font-semibold text-fg">{nf.format(o.countries)}</b> {o.countries === 1 ? "country" : "countries"},{" "}
            <b className={`num font-semibold ${o.activeAlerts ? "text-major" : "text-good"}`}>{nf.format(o.activeAlerts)}</b>{" "}
            active {o.activeAlerts === 1 ? "disruption" : "disruptions"} right now. Metros, trains, buses, ferries and
            airport boards, straight from the operators.
          </>
        )}
      </p>
      <div className="mt-7"><PaletteTrigger variant="hero" /></div>
      <dl className="mt-8 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          ["Lines tracked", o.lines],
          ["Stations and airports", o.stations],
          ["Vehicles on the map", o.vehicles],
          ["Departures on boards", o.departures],
        ].map(([k, v]) => (
          <div key={k as string}>
            <dd className="num text-2xl font-semibold tracking-tight">{nf.format(v as number)}</dd>
            <dt className="text-xs text-muted">{k}</dt>
          </div>
        ))}
      </dl>
      <span className="sr-only">{pluralize(o.cities, "city", "cities")} covered</span>
    </div>
  );
}
