import type { Departure, DepartureState, StationState, StationStatus, Mode } from "@/lib/types";

/** Convert a wall-clock time ("2026-11-04T16:51:00", no offset) in an IANA zone to a UTC Date. */
export function localToDate(local: string, tz: string): Date {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(Number.NaN);
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, +x.value]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  };
  const first = asUtc - offsetAt(asUtc);
  return new Date(asUtc - offsetAt(first));
}

export function delayMinutes(scheduled: Date, estimated?: Date): number | undefined {
  if (!estimated) return undefined;
  return Math.round((estimated.getTime() - scheduled.getTime()) / 60000);
}

export function departureState(opts: { cancelled?: boolean; delay?: number; realtime?: boolean }): DepartureState {
  if (opts.cancelled) return "cancelled";
  if ((opts.delay ?? 0) >= 5) return "delayed";
  if (opts.realtime) return "on_time";
  return "scheduled";
}

/** Summarize a station's board as one StationStatus. */
export function stationFromBoard(
  base: { stationId: string; name: string; mode: Mode; city?: string; country?: string; lat?: number; lon?: number },
  board: Departure[],
): StationStatus {
  const live = board.filter((d) => d.status !== "cancelled" && d.delayMinutes != null);
  const avg = live.length ? live.reduce((s, d) => s + Math.max(0, d.delayMinutes ?? 0), 0) / live.length : undefined;
  const cancelled = board.filter((d) => d.status === "cancelled").length;
  let status: StationState = "normal";
  if (!board.length) status = "unknown";
  else if ((avg ?? 0) >= 15 || cancelled / board.length >= 0.3) status = "major_delays";
  else if ((avg ?? 0) >= 5 || cancelled > 0) status = "delays";
  return {
    ...base,
    status,
    statusText: board.length ? `${board.length} services, ${cancelled} cancelled` : "no services on board",
    delayMinutes: avg == null ? undefined : Math.round(avg * 10) / 10,
  };
}

export const stripHtml = (s: string) =>
  s
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

export function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Keep the first item for each id. */
export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
