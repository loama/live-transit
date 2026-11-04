import { getAlerts } from "@/data/cached";
import { Card, Empty, Section } from "@/components/ui/section";
import { AlertRow } from "@/components/ui/alert-row";

export async function DisruptedFeed() {
  const { items } = await getAlerts({ minSeverity: "minor", limit: 60 });
  const seen = new Map<string, number>();
  const top = items.filter((a) => {
    const n = seen.get(a.sourceId) ?? 0;
    seen.set(a.sourceId, n + 1);
    return n < 2;
  }).slice(0, 8);
  return (
    <Section title="Disrupted right now" hint="Most severe active alerts, at most two per operator." href="/disruptions">
      {top.length === 0 ? (
        <Empty>No active disruptions reported by the connected sources.</Empty>
      ) : (
        <Card><ul>{top.map((a) => <AlertRow key={`${a.sourceId}/${a.id}`} a={a} />)}</ul></Card>
      )}
    </Section>
  );
}
