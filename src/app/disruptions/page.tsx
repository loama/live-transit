import { Suspense } from "react";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import Link from "next/link";
import { getAlerts, getSources } from "@/data/cached";
import { Card, Container, Empty, PageHeader, Skeleton } from "@/components/ui/section";
import { AlertRow } from "@/components/ui/alert-row";
import { DisruptionFilters, type Filters } from "@/components/disruptions/filters";

export const metadata: Metadata = {
  title: "Disruptions",
  description: "Active service disruptions on public transport networks worldwide, filterable by country, mode and severity.",
  alternates: { canonical: "/disruptions" },
};

const PAGE = 25;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const SEV = ["info", "minor", "major", "severe"];
const MODES = ["air", "rail", "metro", "tram", "bus", "ferry", "cable", "other"];

async function Results({ sp }: { sp: PageProps<"/disruptions">["searchParams"] }) {
  const raw = await sp;
  const cursor = one(raw.cursor);
  const sev = one(raw.severity);
  const mode = one(raw.mode);
  const f: Filters = {
    country: one(raw.country)?.slice(0, 2).toLowerCase(),
    mode: mode && MODES.includes(mode) ? mode : undefined,
    severity: sev && SEV.includes(sev) ? sev : undefined,
  };
  const [{ items, nextCursor }, sources] = await Promise.all([
    getAlerts({ ...f, cursor, limit: PAGE }),
    getSources(),
  ]);
  const countries = [...new Set(sources.map((s) => s.country))].sort();
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const next = nextCursor && new URLSearchParams([...qs, ["cursor", nextCursor]]).toString();
  return (
    <>
      <DisruptionFilters f={f} countries={countries} />
      {items.length === 0 ? (
        <Empty>No active disruptions match these filters.</Empty>
      ) : (
        <Card><ul>{items.map((a) => <AlertRow key={`${a.sourceId}/${a.id}`} a={a} />)}</ul></Card>
      )}
      <nav aria-label="Pagination" className="flex items-center justify-between py-5 text-sm">
        {cursor ? <Link href={`/disruptions${qs.size ? `?${qs}` : ""}`} className="text-muted hover:text-fg">&larr; Back to the most severe</Link> : <span />}
        {next && <Link href={`/disruptions?${next}`} className="rounded-lg border border-border-strong px-4 py-2 font-medium hover:bg-surface-2">Next {PAGE} &rarr;</Link>}
      </nav>
    </>
  );
}

export default function DisruptionsPage({ searchParams }: PageProps<"/disruptions">) {
  return (
    <Container className="pb-8">
      <AutoRefresh />
      <PageHeader eyebrow="Worldwide" title="Disruptions">
        Active alerts reported by operators, most severe first. Severity follows the operator&apos;s own classification where available.
      </PageHeader>
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}><Results sp={searchParams} /></Suspense>
    </Container>
  );
}
