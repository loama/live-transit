import Link from "next/link";
import type { StationItem } from "@/db/queries";
import { Card, Section } from "@/components/ui/section";
import { StatusPill } from "@/components/ui/status";

export function StationsList({ stations }: { stations: StationItem[] }) {
  if (!stations.length) return null;
  return (
    <Section title="Stations and boards" hint={`${stations.length} tracked.`}>
      <Card>
        <ul className="grid sm:grid-cols-2">
          {stations.slice(0, 60).map((st) => {
            const body = (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{st.name}</span>
                {st.delayMinutes ? <span className="num text-xs text-muted">~{st.delayMinutes} min</span> : null}
                <StatusPill status={st.status} />
              </>
            );
            return (
              <li key={st.stationId} className="border-b border-border">
                {st.mode === "air" ? (
                  <Link href={`/airports/${st.stationId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className="w-10 font-mono text-sm font-semibold">{st.stationId}</span>{body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </Section>
  );
}
