import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getLine, getSourceDetail } from "@/data/cached";
import { Container, Section, Skeleton } from "@/components/ui/section";
import { AlertRow } from "@/components/ui/alert-row";
import { StatusPill } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { LiveUpdates } from "@/components/ui/live-updates";
import { connectorById } from "@/connectors";
import { LineHeader } from "@/components/line/line-header";
import { LineMapAndVehicles } from "@/components/line/line-map-vehicles";
import { BreadcrumbSchema } from "@/components/seo";

type Props = PageProps<"/n/[id]/l/[lineId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lineId } = await params;
  const sourceId = decodeURIComponent(id);
  const decodedLineId = decodeURIComponent(lineId);
  const line = await getLine(sourceId, decodedLineId);
  if (!line) return { title: "Line not found" };
  const source = await getSourceDetail(sourceId);
  const place = source?.city || source?.country.toUpperCase() || "";
  const title = `Line ${line.name}${place ? `, ${place}` : ""} live status`;
  const statusText = line.status?.statusText || (line.status ? `Service is ${line.status.status}` : "No status available");
  const vehicleText = line.vehicles.length > 0 ? ` ${line.vehicles.length} vehicles tracked.` : "";
  return {
    title,
    description: `Is ${line.name}${line.longName ? ` (${line.longName})` : ""} running? ${statusText}.${vehicleText} Live status, alerts, and positions.`,
    alternates: { canonical: `/n/${sourceId}/l/${encodeURIComponent(decodedLineId)}` },
    openGraph: { title, url: `/n/${sourceId}/l/${encodeURIComponent(decodedLineId)}` },
  };
}

async function LineDetail({ params }: { params: Props["params"] }) {
  const { id, lineId } = await params;
  const sourceId = decodeURIComponent(id);
  const decodedLineId = decodeURIComponent(lineId);
  const [line, source] = await Promise.all([
    getLine(sourceId, decodedLineId),
    getSourceDetail(sourceId),
  ]);
  if (!line || !source) notFound();

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: source.name, url: `/n/${sourceId}` },
    { name: `Line ${line.name}`, url: `/n/${sourceId}/l/${decodedLineId}` },
  ];

  return (
    <Container>
      <BreadcrumbSchema items={breadcrumbs} />
      <AutoRefresh />
      <nav aria-label="Breadcrumb" className="pt-6 text-sm">
        <Link href={`/n/${encodeURIComponent(sourceId)}`} className="text-muted hover:text-fg">&larr; {source.name}{source.city ? `, ${source.city}` : ""}</Link>
      </nav>
      <LineHeader line={line} source={source} />
      <div className="pt-3"><LiveUpdates sourceId={sourceId} lineId={decodedLineId} label={`line ${line.name}`} /></div>
      <LineMapAndVehicles line={line} realtime={!!connectorById.get(sourceId)?.live} />
      {line.alerts.length > 0 && (
        <Section title="Alerts" hint={`${line.alerts.length} active ${line.alerts.length === 1 ? "alert" : "alerts"} affecting this line`}>
          <ul className="rounded-xl border border-border bg-surface">
            {line.alerts.map((a) => <AlertRow key={a.id} a={a} showSource={false} />)}
          </ul>
        </Section>
      )}
      {line.history.length > 0 && (
        <Section title="Status history" hint="Recent service status changes, newest first.">
          <ol className="rounded-xl border border-border bg-surface">
            {line.history.map((h) => (
              <li key={h.at + h.to} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 text-sm last:border-0">
                <TimeAgo iso={h.at} className="num w-20 shrink-0 text-xs text-faint" />
                {h.from && <><StatusPill status={h.from} /><span aria-label="changed to" className="text-faint">&rarr;</span></>}
                <StatusPill status={h.to} />
                {h.text && <span className="min-w-0 truncate text-muted">{h.text}</span>}
              </li>
            ))}
          </ol>
        </Section>
      )}
      <footer className="border-t border-border py-6 text-sm text-muted">
        Data from{" "}
        {source.homepage ? (
          <a href={source.homepage} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            {source.operator}
          </a>
        ) : (
          <span className="font-medium">{source.operator}</span>
        )}
        {source.attribution && <span className="ml-1">({source.attribution})</span>}
      </footer>
    </Container>
  );
}

export default function LinePage({ params }: Props) {
  return (
    <Suspense fallback={<Container><Skeleton className="my-12 h-48" /></Container>}>
      <LineDetail params={params} />
    </Suspense>
  );
}
