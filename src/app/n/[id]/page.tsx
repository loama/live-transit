import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRoutes, getSourceDetail, getVehiclesBySource } from "@/data/cached";
import { connectorById } from "@/connectors";
import { Container, Skeleton } from "@/components/ui/section";
import { NetworkHeader } from "@/components/network/header";
import { NetworkAlerts } from "@/components/network/alerts-list";
import { StationsList } from "@/components/network/stations-list";
import { NetworkFooter } from "@/components/network/footer";
import { NetworkNews } from "@/components/network/news";
import { NetworkLive } from "@/components/network/network-live";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { LiveUpdates } from "@/components/ui/live-updates";
import { BreadcrumbSchema } from "@/components/seo";

type Props = PageProps<"/n/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = await getSourceDetail(decodeURIComponent(id));
  if (!s) return { title: "Network not found" };
  const place = s.city || s.country.toUpperCase();
  const title = `${s.name}${s.city ? `, ${s.city}` : ""} live status`;
  const modesText = s.modes.length === 1 ? s.modes[0] : s.modes.slice(0, 2).join(", ");
  const statusSummary = s.disruptedLines > 0
    ? `${s.disruptedLines} ${s.disruptedLines === 1 ? "line" : "lines"} disrupted`
    : "All lines running normally";
  return {
    title,
    description: `Is the ${s.name} running? Live ${modesText} status for ${place}. ${statusSummary}. Real-time alerts, vehicle positions, and line status from ${s.operator}.`,
    alternates: { canonical: `/n/${s.id}` },
    openGraph: { title, description: `Live status, alerts, and vehicle positions for ${s.name} (${s.operator}).`, url: `${s.id}` },
  };
}

async function Live({ id, s }: { id: string; s: NonNullable<Awaited<ReturnType<typeof getSourceDetail>>> }) {
  const [vehicles, catalog] = await Promise.all([getVehiclesBySource(id), getRoutes(id)]);
  const boxes = catalog.flatMap((r) => (r.bbox ? [r.bbox] : []));
  const bbox = boxes.length
    ? ([Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] as [number, number, number, number])
    : null;
  return (
    <NetworkLive
      sourceId={id}
      bbox={bbox}
      routeCount={catalog.length}
      realtime={!!connectorById.get(id)?.live}
      center={s.lat != null && s.lon != null ? [s.lon, s.lat] : null}
      vehicles={vehicles.slice(0, 3000)}
      lines={s.lines.map((l) => ({
        lineId: l.lineId, lineName: l.lineName, longName: l.longName ?? null, mode: l.mode, color: l.color,
        status: l.status, statusText: l.statusText, since: l.since, vehicles: l.vehicles ?? 0, ...(l.bbox ? { bbox: l.bbox } : {}),
      }))}
    />
  );
}

async function Network({ params }: { params: Props["params"] }) {
  const id = decodeURIComponent((await params).id);
  const s = await getSourceDetail(id);
  if (!s) notFound();
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: s.name, url: `/n/${id}` },
  ];
  return (
    <Container>
      <BreadcrumbSchema items={breadcrumbs} />
      <AutoRefresh />
      <NetworkHeader s={s} />
      <div className="pt-3"><LiveUpdates sourceId={id} label={s.name} /></div>
      <NetworkAlerts alerts={s.alerts} />
      <Suspense fallback={<Skeleton className="my-8 h-[520px]" />}><Live id={id} s={s} /></Suspense>
      <NetworkNews sourceId={id} />
      <StationsList stations={s.stations} />
      <NetworkFooter s={s} />
    </Container>
  );
}

export default function NetworkPage({ params }: Props) {
  return (
    <Suspense fallback={<Container><Skeleton className="my-12 h-48" /></Container>}>
      <Network params={params} />
    </Suspense>
  );
}
