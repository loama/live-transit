import type { getSourceDetail } from "@/data/cached";
import { safeHref } from "@/components/ui/format";

type Source = NonNullable<Awaited<ReturnType<typeof getSourceDetail>>>;

export function NetworkFooter({ s }: { s: Source }) {
  const home = safeHref(s.homepage);
  const counts = Object.entries(s.counts).filter(([, n]) => n > 0);
  return (
    <aside className="mb-8 mt-4 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
      <h2 className="mb-2 font-medium text-fg">About this data</h2>
      <p>
        {s.attribution ?? `Data from ${s.operator}.`}
        {s.license ? ` License: ${s.license}.` : ""}
        {home && <> Official source: <a className="text-accent hover:underline" href={home} target="_blank" rel="noopener noreferrer">{home.replace(/^https?:\/\//, "")}</a>.</>}
      </p>
      <p className="mt-2">
        Feed type: {s.kind}. Last ingest produced{" "}
        {counts.length ? counts.map(([k, n]) => `${n.toLocaleString("en-US")} ${k}`).join(", ") : "no records"}.
        Machine-readable at <code className="font-mono text-xs">/api/v1/sources/{s.id}</code>.
      </p>
    </aside>
  );
}
