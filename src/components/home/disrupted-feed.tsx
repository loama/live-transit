import { getAlerts } from "@/data/cached";
import { Card, Empty, Section } from "@/components/ui/section";
import { AlertRow } from "@/components/ui/alert-row";

export async function DisruptedFeed() {
  const { items } = await getAlerts({ minSeverity: "minor", limit: 8 });
  return (
    <Section title="Disrupted right now" hint="Most severe active alerts, worldwide." href="/disruptions">
      {items.length === 0 ? (
        <Empty>No active disruptions reported by the connected sources.</Empty>
      ) : (
        <Card><ul>{items.map((a) => <AlertRow key={`${a.sourceId}/${a.id}`} a={a} />)}</ul></Card>
      )}
    </Section>
  );
}
