import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getStations } from "@/data/cached";
import { groupBy } from "@/data/derive";
import { Container, Empty, PageHeader, Skeleton } from "@/components/ui/section";
import { StatusPill, delayTone, statusLabel } from "@/components/ui/status";
import { AirportsMap } from "@/components/airport/airports-map";
import { countryName, flag } from "@/components/ui/format";

export const metadata: Metadata = {
  title: "Airport departure and arrival boards",
  description: "Live flight boards for airports worldwide. Real-time departures, arrivals, delays, gates, and cancellations from official airport sources.",
  alternates: { canonical: "/airports" },
  openGraph: { title: "Airport flight boards", url: "/airports" },
};

async function AirportList() {
  const all = await getStations({ mode: "air", limit: 1000 });
  if (!all.length) return <Empty>No airport boards are connected yet.</Empty>;
  const byCountry = [...groupBy(all, (a) => a.country ?? "xx").entries()].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0])));
  const points = all
    .filter((a) => a.lat != null && a.lon != null)
    .map((a) => ({
      id: a.stationId, name: a.name, city: a.city, lat: a.lat!, lon: a.lon!,
      tone: delayTone(a.status, a.delayMinutes ?? 0),
      note: a.delayMinutes ? `${statusLabel(a.status)}, about ${a.delayMinutes} min` : statusLabel(a.status),
    }));
  return (
    <div className="space-y-6">
      {points.length > 0 && <AirportsMap airports={points} />}
      {byCountry.map(([cc, list]) => (
        <section key={cc}>
          <h2 className="mb-2 text-sm font-medium text-muted"><span aria-hidden>{flag(cc)}</span> {countryName(cc)}</h2>
          <div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {list.map((a) => (
                <li key={`${a.sourceId}-${a.stationId}`} className="overflow-hidden rounded-xl border border-border bg-surface">
                  <Link href={`/airports/${a.stationId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="w-12 font-mono text-lg font-semibold tracking-wider">{a.stationId}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-muted">{a.city}</span>
                    </span>
                    <StatusPill status={a.status} delayMinutes={a.delayMinutes ?? 0} label={a.delayMinutes ? `~${a.delayMinutes} min` : undefined} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

export default function AirportsPage() {
  return (
    <Container>
      <PageHeader eyebrow="Airports" title="Departure and arrival boards">
        Flight boards published by airports and aviation authorities. Delay figures are the airport&apos;s own reporting.
      </PageHeader>
      <div className="py-6">
        <Suspense fallback={<Skeleton className="h-96" />}><AirportList /></Suspense>
      </div>
    </Container>
  );
}
