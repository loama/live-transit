import type { getLine, getSourceDetail } from "@/data/cached";
import { ModeIcon } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status";
import { TimeAgo } from "@/components/ui/time-ago";
import { MODE_LABEL } from "@/components/ui/format";
import { LineBadge } from "@/components/network/lines-explorer";

type Line = NonNullable<Awaited<ReturnType<typeof getLine>>>;
type Source = NonNullable<Awaited<ReturnType<typeof getSourceDetail>>>;

export function LineHeader({ line, source }: { line: Line; source: Source }) {
  return (
    <header className="border-b border-border pb-6 pt-8 sm:pt-12">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <LineBadge name={line.name} color={line.color} className="h-10 max-w-none px-3 text-base" />
        <div className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
          <ModeIcon mode={line.mode} size={13} />
          {MODE_LABEL[line.mode] ?? line.mode}
        </div>
      </div>
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        {line.name}
        {line.longName && <span className="text-muted"> {line.longName}</span>}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {line.status && (
          <>
            <StatusPill status={line.status.status} label={line.status.statusText} />
            <span className="text-muted">
              since <TimeAgo iso={line.status.since} className="num font-medium text-fg" />
            </span>
          </>
        )}
        <span className="text-muted">
          Data updated <TimeAgo iso={source.lastSuccessAt} className="num font-medium text-fg" />
        </span>
      </div>
    </header>
  );
}
