export type Health = "live" | "stale" | "failing" | "pending";

const iso = (d: unknown): string | null => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));
export { iso };

/** SQL expression computing a source's health from its row in `sources` (alias s). */
export const HEALTH_SQL = `CASE
  WHEN s.consecutive_failures >= 3 THEN 'failing'
  WHEN s.last_success_at IS NULL THEN 'pending'
  WHEN s.last_success_at >= now() - make_interval(mins => GREATEST(5, s.interval_minutes * 3)) THEN 'live'
  ELSE 'stale' END`;

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export function encodeCursor(parts: (string | number)[]): string {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}

export function decodeCursor(c?: string): (string | number)[] | undefined {
  if (!c) return undefined;
  try {
    const v = JSON.parse(Buffer.from(c, "base64url").toString("utf8"));
    return Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Normalize a flight / train number: "la 2365" -> "LA2365". */
export const normalizeService = (q: string) => q.toUpperCase().replace(/[\s-]+/g, "");

export function clampLimit(n: number | undefined, def: number, max: number) {
  if (!n || !Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
}
