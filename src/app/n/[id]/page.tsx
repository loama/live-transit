import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSourceDetail, getVehiclesBySource } from "@/data/cached";
import { Container, Section, Skeleton } from "@/components/ui/section";
import { NetworkHeader } from "@/components/network/header";
import { LinesGrid } from "@/components/network/lines-grid";
import { NetworkAlerts } from "@/components/network/alerts-list";
import { StationsList } from "@/components/network/stations-list";
import { NetworkFooter } from "@/components/network/footer";
import { VehicleMap } from "@/components/map/vehicle-map";

type Props = PageProps<"/n/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = await getSourceDetail(decodeURIComponent(id));
  if (!s) return { title: "Network not found" };
  const title = `${s.name}${s.city ? `, ${s.city}` : ""} live status`;
  return {
    title,
    description: `Live service status, alerts and delays for ${s.name} (${s.operator}).`,
    alternates: { canonical: `/n/${s.id}` },
  };
}

async function Vehicles({ id }: { id: string }) {
  const vs = await getVehiclesBySource(id);
  if (!vs.length) return null;
  const initial = vs.slice(0, 1500).map((v) => ({ id: v.id, lat: v.lat, lon: v.lon, mode: v.mode, route: v.routeName }));
  return (
    <Section title="Live vehicles" hint={`${vs.length.toLocaleString("en-US")} vehicles reporting a position. Refreshes every 30 seconds.`}>
      <VehicleMap sourceId={id} initial={initial} />
    </Section>
  );
}

async function Network({ params }: { params: Props["params"] }) {
  const id = decodeURIComponent((await params).id);
  const s = await getSourceDetail(id);
  if (!s) notFound();
  return (
    <Container>
      <NetworkHeader s={s} />
      <NetworkAlerts alerts={s.alerts} />
      <LinesGrid lines={s.lines} />
      <StationsList stations={s.stations} />
      <Suspense fallback={<Skeleton className="my-8 h-96" />}><Vehicles id={id} /></Suspense>
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
