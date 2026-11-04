import Link from "next/link";
import type { SourceSummary } from "@/db/queries";
import { groupBy } from "@/data/derive";
import { Card } from "@/components/ui/section";
import { ModeIcon } from "@/components/ui/icons";
import { HealthBadge } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";
import { countryName, flag, REGION_LABEL } from "@/components/ui/format";

export function RegionGroup({ region, sources }: { region: string; sources: SourceSummary[] }) {
  const countries = [...groupBy(sources, (s) => s.country).entries()].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0])));
  return (
    <section id={region} className="scroll-mt-20 py-5">
      <h2 className="mb-3 flex items-baseline gap-3 text-lg font-semibold tracking-tight">
        {REGION_LABEL[region] ?? region}
        <span className="num text-sm font-normal text-muted">{sources.length} sources, {countries.length} countries</span>
      </h2>
      <div className="space-y-4">
        {countries.map(([cc, list]) => (
          <Card key={cc}>
            <h3 className="border-b border-border px-4 py-2 text-sm font-medium"><span aria-hidden>{flag(cc)}</span> {countryName(cc)}</h3>
            <ul>
              {list.map((s) => (
                <li key={s.id} className="border-b border-border last:border-0">
                  <Link href={`/n/${encodeURIComponent(s.id)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-2">
                    <span className="min-w-0 flex-1 basis-48 truncate text-sm">{s.city ? `${s.city} · ` : ""}{s.name}</span>
                    <span className="flex items-center gap-1 text-muted">{s.modes.slice(0, 5).map((m) => <ModeIcon key={m} mode={m} size={14} />)}</span>
                    <span className="num w-44 text-xs text-muted">{Object.entries(s.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n.toLocaleString("en-US")} ${k}`).join(", ") || "no records"}</span>
                    <TimeAgo iso={s.lastSuccessAt} className="num w-16 text-xs text-muted" />
                    <HealthBadge health={s.health} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}
