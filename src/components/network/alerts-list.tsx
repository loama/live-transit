import type { AlertItem } from "@/db/queries";
import { Card, Section } from "@/components/ui/section";
import { AlertRow } from "@/components/ui/alert-row";

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
          <Card><ul>{sorted.slice(0, 50).map((a) => <AlertRow key={a.id} a={a} showSource={false} />)}</ul></Card>
        )}
        {sorted.length > 50 && <p className="mt-2 text-xs text-muted">Showing the 50 most severe of {sorted.length}.</p>}
      </Section>
    </div>
  );
}
