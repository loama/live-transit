import { Suspense } from "react";
import type { Metadata } from "next";
import { getHealth, getOverview, getSources } from "@/data/cached";
import { Container, PageHeader, Skeleton } from "@/components/ui/section";
import { SourceExplorer } from "@/components/coverage/explorer";
import { TimeAgo } from "@/components/ui/time-ago";
import { nf } from "@/components/ui/format";

export const metadata: Metadata = {
  title: "Status",
  description: "Ingestion health of every Live Transit source: live, stale or failing.",
  alternates: { canonical: "/status" },
};

const TILES = [
  ["live", "Live", "text-good"],
  ["stale", "Stale", "text-minor"],
  ["failing", "Failing", "text-severe"],
  ["pending", "Pending", "text-unknown"],
] as const;

async function Status() {
  const [h, o, src] = await Promise.all([getHealth(), getOverview(), getSources()]);
  const meta = new Map(src.map((s) => [s.id, s]));
  const rows = h.sources.map((s) => ({ ...s, city: meta.get(s.id)?.city ?? null, region: meta.get(s.id)?.region ?? "other", modes: meta.get(s.id)?.modes ?? [] }));
  const total = h.sources.length;
  const pct = total ? Math.round((h.summary.live / total) * 100) : 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 py-6 sm:grid-cols-4">
        {TILES.map(([k, label, c]) => (
          <div key={k} className="rounded-xl border border-border bg-surface p-4">
            <p className={`num text-3xl font-semibold ${c}`}>{nf.format(h.summary[k])}</p>
            <p className="text-sm text-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">
        {total ? <><b className="num text-fg">{pct}%</b> of sources are refreshing on schedule. </> : "No sources yet. "}
        Last successful ingest <TimeAgo iso={o.lastIngestAt} className="num font-medium text-fg" />.
        A source is live when it succeeded within three of its own intervals, stale when older, and failing after three consecutive errors.
      </p>
      <SourceExplorer rows={rows} variant="status" />
    </>
  );
}

export default function StatusPage() {
  return (
    <Container className="pb-8">
      <PageHeader eyebrow="Trust" title="Ingestion status">
        Whether the data you see is fresh. If a source goes quiet, we say so on its page instead of showing old data as current.
      </PageHeader>
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}><Status /></Suspense>
    </Container>
  );
}
