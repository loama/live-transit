import { Suspense } from "react";
import { getOverview } from "@/data/cached";
import { Container, Skeleton } from "@/components/ui/section";
import { Hero } from "@/components/home/hero";
import { MapSection } from "@/components/home/map-section";
import { DisruptedFeed } from "@/components/home/disrupted-feed";
import { AirportsStrip } from "@/components/home/airports-strip";
import { FeaturedNetworks } from "@/components/home/featured-networks";
import { ApiStrip } from "@/components/home/api-strip";
import { AutoRefresh } from "@/components/ui/auto-refresh";

async function HeroLoader() {
  return <Hero o={await getOverview()} />;
}

export default function Home() {
  return (
    <>
      <AutoRefresh />
      <Container>
        <Suspense fallback={<Skeleton className="my-12 h-72" />}><HeroLoader /></Suspense>
        <Suspense fallback={<Skeleton className="h-[360px] sm:h-[460px]" />}><MapSection /></Suspense>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 lg:grid-cols-[3fr_2fr]">
          <Suspense fallback={<Skeleton className="my-8 h-96" />}><DisruptedFeed /></Suspense>
          <Suspense fallback={<Skeleton className="my-8 h-96" />}><AirportsStrip /></Suspense>
        </div>
        <Suspense fallback={<Skeleton className="my-8 h-64" />}><FeaturedNetworks /></Suspense>
      </Container>
      <div className="mt-8"><ApiStrip /></div>
    </>
  );
}
