import Link from "next/link";
import type { SourceSummary } from "@/db/queries";
import { ModeIcon } from "./icons";
import { HealthBadge } from "./status";
import { TimeAgo } from "./time-ago";
import { flag } from "./format";

export function SourceRow({ s }: { s: SourceSummary }) {
  return (
    <li>
      <Link href={`/n/${encodeURIComponent(s.id)}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
        <span aria-hidden className="text-lg">{flag(s.country)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{s.city ? `${s.city} · ` : ""}{s.name}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {s.modes.slice(0, 4).map((m) => <ModeIcon key={m} mode={m} size={13} />)}
            <span className="ml-1">{s.activeAlerts} alerts</span>
            <span aria-hidden>·</span>
            <TimeAgo iso={s.lastSuccessAt} />
          </span>
        </span>
        <HealthBadge health={s.health} />
      </Link>
    </li>
  );
}
