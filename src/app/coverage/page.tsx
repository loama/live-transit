import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getSources, getPlanned } from "@/data/cached";
import { Container, Empty, PageHeader, Skeleton } from "@/components/ui/section";
import { SourceExplorer } from "@/components/coverage/explorer";
import { toRow } from "@/components/coverage/rows";
import { PlannedList } from "@/components/coverage/planned-list";
import { nf } from "@/components/ui/format";

export const metadata: Metadata = {
  title: "Coverage: networks, cities, and countries",
  description: "Every public transport network Live Transit covers: metros, trains, buses, ferries, and airports across dozens of countries. Feed health and upcoming sources.",
  alternates: { canonical: "/coverage" },
  openGraph: { title: "Transit coverage by country", url: "/coverage" },
};

async function Coverage() {
  const [sources, planned] = await Promise.all([getSources(), getPlanned()]);
  const countries = new Set(sources.map((s) => s.country)).size;
  return (
    <>
      <p className="py-4 text-sm text-muted">
        <b className="num text-fg">{nf.format(sources.length)}</b> sources in <b className="num text-fg">{countries}</b> countries.{" "}
        <Link href="/status" className="text-accent hover:underline">Ingestion health</Link>
      </p>
      <p className="pb-3 text-sm"><a href="#planned" className="text-accent hover:underline">{planned.length} more sources coming next</a></p>
      {sources.length === 0 ? <Empty>No sources have been ingested yet.</Empty> : <SourceExplorer rows={sources.map(toRow)} variant="coverage" />}
      <PlannedList items={planned} />
    </>
  );
}

export default function CoveragePage() {
  return (
    <Container className="pb-8">
      <PageHeader eyebrow="Coverage" title="What we read, and what is coming">
        Live Transit only uses official operator feeds and open data portals. Health shows whether each feed is
        refreshing on schedule.
      </PageHeader>
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}><Coverage /></Suspense>
    </Container>
  );
}
