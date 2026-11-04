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
import { NetworkLive } from "@/components/network/network-live";
import { AutoRefresh } from "@/components/ui/auto-refresh";

type Props = PageProps<"/n/[id]">;

/** Route geometry is inlined in the page up to this many routes; bigger networks load it per viewport. */
const INLINE_ROUTES = 400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = await getSourceDetail(decodeURIComponent(id));
  if (!s) return { title: "Network not found" };
  const title = `${s.name}${s.city ? `, ${s.city}` : ""} live status`;
  return {
    title,
    description: `Live service status, alerts, line map and vehicle positions for ${s.name} (${s.operator}).`,
    alternates: { canonical: `/n/${s.id}` },
  };
}

async function Live({ id, s }: { id: string; s: NonNullable<Awaited<ReturnType<typeof getSourceDetail>>> }) {
  const [vehicles, catalog] = await Promise.all([getVehiclesBySource(id), getRoutes(id)]);
  const routes = catalog.length && catalog.length <= INLINE_ROUTES ? await getRoutes(id, true) : null;
  return (
    <NetworkLive
      sourceId={id}
      routes={routes}
      routeCount={catalog.length}
      realtime={!!connectorById.get(id)?.live}
      center={s.lat != null && s.lon != null ? [s.lon, s.lat] : null}
      vehicles={vehicles.slice(0, 3000)}
      lines={s.lines.map((l) => ({
        lineId: l.lineId, lineName: l.lineName, longName: l.longName ?? null, mode: l.mode, color: l.color,
        status: l.status, statusText: l.statusText, since: l.since, vehicles: l.vehicles ?? 0,
      }))}
    />
  );
}

async function Network({ params }: { params: Props["params"] }) {
  const id = decodeURIComponent((await params).id);
  const s = await getSourceDetail(id);
  if (!s) notFound();
  return (
    <Container>
      <AutoRefresh />
      <NetworkHeader s={s} />
      <NetworkAlerts alerts={s.alerts} />
      <Suspense fallback={<Skeleton className="my-8 h-[520px]" />}><Live id={id} s={s} /></Suspense>
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
