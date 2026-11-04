import Link from "next/link";
import { getLines } from "@/data/cached";
import { groupBy } from "@/data/derive";
import { Card, Empty, Section } from "@/components/ui/section";
import { StatusPill } from "@/components/ui/status";
import { LineChip } from "@/components/network/line-chip";
import { flag } from "@/components/ui/format";

export async function FeaturedNetworks() {
  const lines = await getLines();
  const groups = [...groupBy(lines, (l) => l.sourceId).values()]
    .map((ls) => ({ ls, bad: ls.filter((l) => l.status !== "good" && l.status !== "unknown").length }))
    .filter(({ ls }) => ls.length <= 40)
    .sort((a, b) => b.bad - a.bad || b.ls.length - a.ls.length)
    .slice(0, 6);
  return (
    <Section title="Featured networks" hint="Line-by-line status where operators publish it." href="/coverage" hrefLabel="All coverage">
      {groups.length === 0 ? (
        <Empty>No line-level feeds connected yet.</Empty>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {groups.map(({ ls, bad }) => (
            <Card key={ls[0].sourceId} className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Link href={`/n/${encodeURIComponent(ls[0].sourceId)}`} className="block min-w-0 flex-1 truncate font-medium hover:underline">
                  <span>{flag(ls[0].country)} {ls[0].city ? `${ls[0].city} · ` : ""}{ls[0].sourceName}</span>
                </Link>
                <StatusPill status={bad ? "minor" : "good"} label={bad ? `${bad} disrupted` : "All good"} />
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {[...ls].sort((a, b) => Number(a.status === "good") - Number(b.status === "good")).slice(0, 12).map((l) => (
                  <li key={l.lineId}><LineChip line={l} /></li>
                ))}
              </ul>
              {ls.length > 12 && <p className="mt-2 text-xs text-muted">and {ls.length - 12} more lines</p>}
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
