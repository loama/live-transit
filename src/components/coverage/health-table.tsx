import Link from "next/link";
import type { getHealth } from "@/data/cached";
import { Card } from "@/components/ui/section";
import { HealthBadge } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";
import { flag } from "@/components/ui/format";

type Item = Awaited<ReturnType<typeof getHealth>>["sources"][number];

export function HealthTable({ items }: { items: Item[] }) {
  const order = { failing: 0, stale: 1, pending: 2, live: 3 } as const;
  const sorted = [...items].sort((a, b) => order[a.health] - order[b.health] || a.id.localeCompare(b.id));
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-faint">
          <tr>
            <th className="px-4 py-2 font-medium">Source</th>
            <th className="px-2 py-2 font-medium">Health</th>
            <th className="px-2 py-2 font-medium">Last success</th>
            <th className="px-2 py-2 text-right font-medium">Every</th>
            <th className="px-2 py-2 text-right font-medium">Took</th>
            <th className="px-4 py-2 font-medium">Last error</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2">
                <Link href={`/n/${encodeURIComponent(s.id)}`} className="hover:underline"><span aria-hidden>{flag(s.country)}</span> {s.name}</Link>
              </td>
              <td className="px-2 py-2"><HealthBadge health={s.health} /></td>
              <td className="num px-2 py-2 text-muted"><TimeAgo iso={s.lastSuccessAt} /></td>
              <td className="num px-2 py-2 text-right text-muted">{s.intervalMinutes} min</td>
              <td className="num px-2 py-2 text-right text-muted">{s.lastDurationMs != null ? `${(s.lastDurationMs / 1000).toFixed(1)} s` : "-"}</td>
              <td className="max-w-xs truncate px-4 py-2 text-xs text-muted" title={s.lastError ?? undefined}>{s.health === "live" ? "" : s.lastError ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
