import type { LineItem } from "@/db/queries";
import { Card, Section } from "@/components/ui/section";
import { StatusPill } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";

function Swatch({ color }: { color: string | null }) {
  const c = color && /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : "var(--border-strong)";
  return <span aria-hidden className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: c }} />;
}

export function LinesGrid({ lines }: { lines: LineItem[] }) {
  if (!lines.length) return null;
  const rank = (s: string) => (s === "good" ? 2 : s === "unknown" ? 1 : 0);
  const sorted = [...lines].sort((a, b) => rank(a.status) - rank(b.status) || a.lineName.localeCompare(b.lineName, "en", { numeric: true }));
  const bad = lines.filter((l) => rank(l.status) < 2 && l.status !== "unknown").length;
  return (
    <Section title="Lines" hint={bad ? `${bad} of ${lines.length} lines have a service change.` : `All ${lines.length} lines report good service.`}>
      <Card>
        <ul className="grid sm:grid-cols-2">
          {sorted.map((l) => (
            <li key={l.lineId} className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Swatch color={l.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.lineName}</p>
                <p className="truncate text-xs text-muted">
                  {l.statusText && l.statusText.toLowerCase() !== l.status ? `${l.statusText} · ` : ""}
                  since <TimeAgo iso={l.since} />
                </p>
              </div>
              <StatusPill status={l.status} />
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}
