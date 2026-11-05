import { Icon } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status";

export interface Hit {
  type: "source" | "station" | "line" | "stop" | "alert";
  id: string;
  sourceId: string;
  title: string;
  subtitle: string;
  status: string | null;
  lat?: number;
  lon?: number;
}

export function hitHref(h: Hit): string {
  if (h.type === "source") return `/n/${encodeURIComponent(h.id)}`;
  if (h.type === "station" && /(^| · )air$/.test(h.subtitle)) return `/airports/${encodeURIComponent(h.id)}`;
  if (h.type === "alert") return `/n/${encodeURIComponent(h.sourceId)}#alerts`;
  if (h.type === "line") return `/n/${encodeURIComponent(h.sourceId)}/l/${encodeURIComponent(h.id)}`;
  if (h.type === "stop" && h.lat != null && h.lon != null) return `/map?lat=${h.lat}&lon=${h.lon}&z=16`;
  return `/n/${encodeURIComponent(h.sourceId)}`;
}

const TYPE_LABEL = { source: "Network", station: "Station", line: "Line", stop: "Stop", alert: "Alert" } as const;

export function PaletteResults({ hits, active, onPick, onHover }: {
  hits: Hit[]; active: number; onPick: (h: Hit) => void; onHover: (i: number) => void;
}) {
  return (
    <ul id="palette-list" role="listbox" aria-label="Search results" className="max-h-[50vh] overflow-y-auto p-1.5">
      {hits.map((h, i) => (
        <li
          key={`${h.type}-${h.sourceId}-${h.id}`}
          id={`palette-opt-${i}`}
          role="option"
          aria-selected={i === active}
          onMouseMove={() => onHover(i)}
          onClick={() => onPick(h)}
          className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${i === active ? "bg-surface-2" : ""}`}
        >
          <span className="w-14 shrink-0 text-xs uppercase tracking-wide text-faint">{TYPE_LABEL[h.type]}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{h.title}</span>
            <span className="block truncate text-xs text-muted">{h.subtitle}</span>
          </span>
          {h.status && <StatusPill status={h.status} />}
          <Icon name="arrow" size={14} className="shrink-0 text-faint" />
        </li>
      ))}
    </ul>
  );
}
