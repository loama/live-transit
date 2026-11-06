import Link from "next/link";
import { allNews, filterNews } from "@/lib/news";

export function NetworkNews({ sourceId }: { sourceId: string }) {
  const items = filterNews(allNews, { sourceId }).slice(0, 5);

  if (items.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-4">Recent News</h2>
      <div className="rounded-lg border border-border bg-surface p-4">
        <ul className="space-y-3">
          {items.map((item) => {
            const date = new Date(item.date);
            const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            return (
              <li key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted mb-1">
                      <time dateTime={item.date}>{formatted}</time>
                      {" • "}
                      <span className="capitalize">{item.kind.replace(/_/g, " ")}</span>
                    </div>
                    <h3 className="font-medium text-sm mb-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-accent"
                      >
                        {item.title}
                      </a>
                    </h3>
                    <p className="text-xs text-muted line-clamp-2">{item.summary}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 pt-3 border-t border-border">
          <Link href="/news" className="text-sm text-accent hover:underline">
            View all transport news &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
