import Link from "next/link";
import type { AlertItem } from "@/db/queries";
import { ModeIcon } from "./icons";
import { SeverityPill } from "./status";
import { TimeAgo } from "./time-ago";
import { flag, safeHref } from "./format";

export function AlertRow({ a, showSource = true }: { a: AlertItem; showSource?: boolean }) {
  const href = safeHref(a.url);
  return (
    <li className="flex gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className="mt-0.5 text-muted">{a.modes.length ? <ModeIcon mode={a.modes[0]} /> : null}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SeverityPill severity={a.severity} />
          {a.routes.slice(0, 4).map((r) => (
            <span key={r} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium">{r}</span>
          ))}
          <TimeAgo iso={a.firstSeenAt} className="text-xs text-faint" />
        </div>
        <p className="mt-1.5 text-sm font-medium leading-snug">{a.title}</p>
        {a.description && a.description !== a.title && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{a.description}</p>
        )}
        <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted">
          {showSource && (
            <Link href={`/n/${encodeURIComponent(a.sourceId)}`} className="hover:text-fg">
              {flag(a.country)} {a.city ? `${a.city}, ` : ""}{a.sourceName}
            </Link>
          )}
          {href && <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-fg">Official notice &#8599;</a>}
        </p>
      </div>
    </li>
  );
}
