import { createHash } from "node:crypto";

export function shortHash(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\u0000")).digest("hex").slice(0, 12);
}

export function cleanText(s: string | undefined | null): string {
  return (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Convert a wall-clock time in a zone with a fixed UTC offset (minutes) to a UTC Date. */
export function fixedOffsetDate(y: number, month1: number, d: number, h: number, min: number, offsetMinutes: number): Date {
  return new Date(Date.UTC(y, month1 - 1, d, h, min) - offsetMinutes * 60_000);
}
