import { Suspense } from "react";
import type { Metadata } from "next";
import { getSources } from "@/data/cached";
import { toMapSources } from "@/data/derive";
import { Skeleton } from "@/components/ui/section";
import { MapExplorer } from "@/components/explorer/map-explorer";

export const metadata: Metadata = {
  title: "Live map",
  description: "Live vehicle positions and route maps for hundreds of public transport networks worldwide, straight from the operators.",
  alternates: { canonical: "/map" },
};

async function Explorer() {
  const sources = toMapSources(await getSources());
  const places = sources.map(({ id, name, city, lat, lon }) => ({ id, name, city, lat, lon }));
  return <MapExplorer sources={sources} places={places} />;
}

export default function MapPage() {
  return (
    <>
      <h1 className="sr-only">Live map</h1>
      <Suspense fallback={<Skeleton className="h-[calc(100dvh-6rem)] rounded-none md:h-[calc(100dvh-3.5rem)]" />}>
        <Explorer />
      </Suspense>
    </>
  );
}
