import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStationById, getStationBoard } from "@/data/cached";
import { Container, Skeleton } from "@/components/ui/section";
import { Board } from "@/components/airport/board";
import { AirportHeader } from "@/components/airport/header";

type Props = PageProps<"/airports/[iata]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const iata = (await params).iata.toUpperCase();
  const a = await getStationById(iata);
  if (!a) return { title: "Airport not found" };
  return {
    title: `${a.name} (${iata}) departures and arrivals`,
    description: `Live departures, arrivals, delays and gates at ${a.name}${a.city ? `, ${a.city}` : ""}.`,
    alternates: { canonical: `/airports/${iata}` },
  };
}

async function Airport({ params }: { params: Props["params"] }) {
  const iata = (await params).iata.toUpperCase();
  const a = await getStationById(iata);
  if (!a || a.mode !== "air") notFound();
  const board = await getStationBoard(iata);
  return (
    <Container className="pb-8">
      <AirportHeader a={a} iata={iata} count={board.length} />
      <div className="mt-6">
        {board.length === 0 && (
          <p className="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">
            This airport reports a status but does not publish a flight board.
          </p>
        )}
        {board.length > 0 && <Board iata={iata} initial={board} />}
      </div>
    </Container>
  );
}

export default function AirportPage({ params }: Props) {
  return (
    <Suspense fallback={<Container><Skeleton className="my-12 h-[32rem]" /></Container>}>
      <Airport params={params} />
    </Suspense>
  );
}
