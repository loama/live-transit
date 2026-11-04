import Link from "next/link";
import { getStations } from "@/data/cached";
import { Card, Empty, Section } from "@/components/ui/section";
import { StatusPill } from "@/components/ui/status";
import { flag } from "@/components/ui/format";

export async function AirportsStrip() {
  const all = await getStations({ mode: "air", limit: 1000 });
  const delayed = all.filter((a) => a.status !== "on_time" && a.status !== "good" && a.status !== "unknown");
  const list = (delayed.length ? delayed : all).slice(0, 8);
  return (
    <Section
      title={delayed.length ? "Airports with delays" : "Airports"}
      hint={delayed.length ? "Reported by airport authorities or the FAA." : "Departure and arrival boards."}
      href="/airports"
    >
      {list.length === 0 ? (
        <Empty>No airport boards connected yet.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.map((a) => (
              <li key={`${a.sourceId}-${a.stationId}`}>
                <Link href={`/airports/${a.stationId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="w-12 font-mono text-lg font-semibold tracking-wider">{a.stationId}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{a.name}</span>
                    <span className="block truncate text-xs text-muted">{flag(a.country)} {a.city}</span>
                  </span>
                  <StatusPill status={a.status} delayMinutes={a.delayMinutes ?? 0} label={a.delayMinutes ? `~${a.delayMinutes} min` : undefined} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Section>
  );
}
