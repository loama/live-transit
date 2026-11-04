import type { LineItem } from "@/db/queries";
import { lineTone, TONE_VAR, statusLabel } from "@/components/ui/status";

/** Compact line badge: operator color swatch plus a status-colored ring. */
export function LineChip({ line }: { line: LineItem }) {
  const tone = lineTone(line.status);
  const swatch = line.color && /^[0-9a-f]{6}$/i.test(line.color) ? `#${line.color}` : "var(--border-strong)";
  return (
    <span
      title={`${line.lineName}: ${line.statusText || statusLabel(line.status)}`}
      className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-2 py-1 text-xs font-medium"
      style={{ borderColor: tone === "good" ? "var(--border)" : TONE_VAR[tone] }}
    >
      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: swatch }} />
      {line.lineName}
      {tone !== "good" && <span className="sr-only">{statusLabel(line.status)}</span>}
    </span>
  );
}
