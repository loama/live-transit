import type { AlertItem } from "@/db/queries";
import { Card, Section } from "@/components/ui/section";
import { AlertRow } from "@/components/ui/alert-row";

/** Alerts shown before the rest are folded away, so the map and lines stay near the top. */
const FIRST = 5;

export function NetworkAlerts({ alerts }: { alerts: AlertItem[] }) {
  const sev = (a: AlertItem) => ({ severe: 0, major: 1, minor: 2, info: 3 })[a.severity] ?? 4;
  const sorted = [...alerts].sort((a, b) => sev(a) - sev(b));
  return (
    <div id="alerts" className="scroll-mt-20">
      <Section title="Active alerts" hint={alerts.length ? `${alerts.length} active.` : undefined}>
        {sorted.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">
            No active alerts from this source.
          </p>
        ) : (
          <Card>
            <ul>{sorted.slice(0, FIRST).map((a) => <AlertRow key={a.id} a={a} showSource={false} />)}</ul>
            {sorted.length > FIRST && (
              <details className="group">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-accent hover:underline group-open:hidden">
                  Show {Math.min(sorted.length, 50) - FIRST} more {sorted.length - FIRST === 1 ? "alert" : "alerts"}
                </summary>
                <ul>{sorted.slice(FIRST, 50).map((a) => <AlertRow key={a.id} a={a} showSource={false} />)}</ul>
              </details>
            )}
          </Card>
        )}
        {sorted.length > 50 && <p className="mt-2 text-xs text-muted">Showing the 50 most severe of {sorted.length}.</p>}
      </Section>
    </div>
  );
}
