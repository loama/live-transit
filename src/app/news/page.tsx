import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container, Empty, PageHeader, Skeleton, Card } from "@/components/ui/section";
import { allNews, filterNews, NEWS_KINDS } from "@/lib/news";
import type { NewsItem } from "@/lib/news";

export const metadata: Metadata = {
  title: "Transport News",
  description: "Recent transport news and service updates from public transport networks worldwide, filterable by country and type.",
  alternates: { canonical: "/news" },
};

const PAGE = 25;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

interface Filters {
  country?: string;
  kind?: string;
}

function NewsFilters({ f, countries }: { f: Filters; countries: string[] }) {
  const select = "rounded border border-border-strong bg-surface px-3 py-1.5 text-sm";
  return (
    <form method="get" action="/news" className="mb-6 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        <span className="text-sm text-muted">Country:</span>
        <select name="country" className={select} defaultValue={f.country || ""}>
          <option value="">All</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-sm text-muted">Type:</span>
        <select name="kind" className={select} defaultValue={f.kind || ""}>
          <option value="">All</option>
          {NEWS_KINDS.map((k) => (
            <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Filter</button>
    </form>
  );
}

function NewsEntry({ item }: { item: NewsItem }) {
  const date = new Date(item.date);
  const formatted = date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return (
    <li className="border-b border-border py-4 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <time dateTime={item.date}>{formatted}</time>
            <span>•</span>
            <span className="uppercase">{item.country}</span>
            <span>•</span>
            <span>{item.kind.replace(/_/g, " ")}</span>
          </div>
          <h3 className="font-medium mb-1">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              {item.title}
            </a>
          </h3>
          <p className="text-sm text-muted">{item.summary}</p>
          {item.sourceIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.sourceIds.map((id) => (
                <Link
                  key={id}
                  href={`/n/${encodeURIComponent(id)}`}
                  className="text-xs text-accent hover:underline"
                >
                  {id}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

async function Results({ sp }: { sp: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await sp;
  const cursor = one(raw.cursor);
  const cursorNum = cursor ? parseInt(cursor, 10) : 0;
  const f: Filters = {
    country: one(raw.country)?.slice(0, 2).toLowerCase(),
    kind: one(raw.kind),
  };
  if (f.kind && !NEWS_KINDS.includes(f.kind as typeof NEWS_KINDS[number])) delete f.kind;

  const all = allNews;
  const filtered = filterNews(all, f);
  const countries = [...new Set(all.map((item) => item.country))].sort();

  const items = filtered.slice(cursorNum, cursorNum + PAGE);
  const hasMore = cursorNum + PAGE < filtered.length;

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const next = hasMore ? new URLSearchParams([...qs, ["cursor", String(cursorNum + PAGE)]]).toString() : null;

  return (
    <>
      <NewsFilters f={f} countries={countries} />
      {items.length === 0 ? (
        <Empty>No news items match these filters.</Empty>
      ) : (
        <Card>
          <ul>
            {items.map((item) => (
              <NewsEntry key={item.id} item={item} />
            ))}
          </ul>
        </Card>
      )}
      <nav aria-label="Pagination" className="flex items-center justify-between py-5 text-sm">
        {cursorNum > 0 ? (
          <Link
            href={`/news${qs.size ? `?${qs}` : ""}`}
            className="text-muted hover:text-fg"
          >
            &larr; Back to start
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/news?${next}`}
            className="rounded-lg border border-border-strong px-4 py-2 font-medium hover:bg-surface-2"
          >
            Next {PAGE} &rarr;
          </Link>
        )}
      </nav>
    </>
  );
}

export default function NewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Container className="pb-8">
      <PageHeader eyebrow="Worldwide" title="Transport News">
        Recent service updates, new lines, closures and network changes reported by operators and authorities.
      </PageHeader>
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}>
        <Results sp={searchParams} />
      </Suspense>
    </Container>
  );
}
