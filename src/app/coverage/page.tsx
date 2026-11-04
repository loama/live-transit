import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getSources, getPlanned } from "@/data/cached";
import { groupBy } from "@/data/derive";
import { Container, Empty, PageHeader, Skeleton } from "@/components/ui/section";
import { RegionGroup } from "@/components/coverage/region-group";
import { PlannedList } from "@/components/coverage/planned-list";
import { REGION_LABEL, nf } from "@/components/ui/format";

export const metadata: Metadata = {
  title: "Coverage",
  description: "Every transport source Live Transit reads, grouped by region and country, with feed health and what is coming next.",
  alternates: { canonical: "/coverage" },
};

async function Coverage() {
  const [sources, planned] = await Promise.all([getSources(), getPlanned()]);
  const regions = [...groupBy(sources, (s) => s.region).entries()].sort((a, b) => b[1].length - a[1].length);
  const countries = new Set(sources.map((s) => s.country)).size;
  return (
    <>
      <p className="py-4 text-sm text-muted">
        <b className="num text-fg">{nf.format(sources.length)}</b> sources in <b className="num text-fg">{countries}</b> countries.{" "}
        <Link href="/status" className="text-accent hover:underline">Ingestion health</Link>
      </p>
      {regions.length > 0 && (
        <nav aria-label="Regions" className="flex flex-wrap gap-2 pb-2">
          {regions.map(([r, l]) => (
            <a key={r} href={`#${r}`} className="rounded-full border border-border px-3 py-1 text-sm text-muted hover:text-fg">
              {REGION_LABEL[r] ?? r} <span className="num text-faint">{l.length}</span>
            </a>
          ))}
          <a href="#planned" className="rounded-full border border-dashed border-border-strong px-3 py-1 text-sm text-muted hover:text-fg">Coming next <span className="num text-faint">{planned.length}</span></a>
        </nav>
      )}
      {regions.length === 0 && <Empty>No sources have been ingested yet.</Empty>}
      {regions.map(([r, list]) => <RegionGroup key={r} region={r} sources={list} />)}
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
