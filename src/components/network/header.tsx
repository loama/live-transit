import type { getSourceDetail } from "@/data/cached";
import { ModeIcon } from "@/components/ui/icons";
import { HealthBadge } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";
import { MODE_LABEL, countryName, flag, safeHref } from "@/components/ui/format";

type Source = NonNullable<Awaited<ReturnType<typeof getSourceDetail>>>;

export function NetworkHeader({ s }: { s: Source }) {
  const home = safeHref(s.homepage);
  return (
    <header className="border-b border-border pb-6 pt-8 sm:pt-12">
      <p className="mb-2 text-sm text-muted">
        <span aria-hidden>{flag(s.country)}</span> {s.city ? `${s.city}, ` : ""}{countryName(s.country)}
      </p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{s.name}</h1>
      <p className="mt-1 text-muted">Operated by {s.operator}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {s.kind === "schedule" ? (
          <span className="text-muted">Timetable only: this operator publishes no live data, so lines and stops show the planned network.</span>
        ) : (
          <>
            <HealthBadge health={s.health} />
            <span className="text-muted">
              Updated <TimeAgo iso={s.lastSuccessAt} className="num font-medium text-fg" />, refreshed every {s.intervalMinutes} min
            </span>
          </>
        )}
        <ul className="flex flex-wrap gap-1.5">
          {s.modes.map((m) => (
            <li key={m} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
              <ModeIcon mode={m} size={13} />{MODE_LABEL[m] ?? m}
            </li>
          ))}
        </ul>
        {home && (
          <a href={home} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            Official site &#8599;
          </a>
        )}
      </div>
      {s.kind !== "schedule" && s.health !== "live" && s.lastError && (
        <p className="mt-3 rounded-lg bg-minor-bg px-3 py-2 text-sm text-minor">
          The last refresh did not succeed, so the data below may be out of date.
        </p>
      )}
    </header>
  );
}
