import type { CallToolResult } from "@modelcontextprotocol/server";

/** Minutes between an ISO timestamp and now, or null when unknown. */
export function minutesAgo(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((now.getTime() - t) / 60_000));
}

/** "2026-11-04 12:00 UTC" */
export function utc(iso: string | null | undefined): string {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown time" : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** "12:00" (UTC), for board rows. */
export function hhmm(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(11, 16) : "-";
}

export function humanDuration(mins: number): string {
  if (mins < 1) return "under 1 min";
  if (mins < 120) return `${mins} min`;
  if (mins < 2880) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} days`;
}

/** "as of 2026-11-04 12:00 UTC, 5 min ago" */
export function asOf(iso: string | null | undefined, now = new Date()): string {
  const m = minutesAgo(iso, now);
  if (m === null) return "no successful update yet";
  return `as of ${utc(iso)}, ${m < 1 ? "just now" : `${humanDuration(m)} ago`}`;
}

/** Markdown table. Cells are sanitized so pipes and newlines cannot break the layout. */
export function table(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) =>
    v === null || v === undefined || v === "" ? "-" : String(v).replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");
}

/** Truncate long free text to n characters. */
export function clip(s: string | null | undefined, n = 200): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}...` : t;
}

/** Note appended when a list was capped. Empty string when nothing was omitted. */
export function capNote(shown: number, total: number, narrowHint: string): string {
  return total > shown ? `\nShowing ${shown} of ${total}; ${total - shown} omitted. ${narrowHint}` : "";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Successful tool result: readable text first, structured JSON second. */
export function ok(text: string, data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: data };
}

/** Tool-level error the model can read and act on. */
export function fail(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const ATTRIBUTION =
  "Data is republished from official operator feeds; freshness varies by source. Check each source's timestamp.";
