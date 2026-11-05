import type { SourceSummary } from "@/db/queries";
import type { Tone } from "@/components/ui/status";
import type { MapSource } from "@/components/map/world-map";

export function sourceTone(s: Pick<SourceSummary, "health" | "activeAlerts" | "disruptedLines"> & { kind?: string }): Tone {
  if (s.kind === "schedule") return "unknown";
  if (s.health === "failing" || s.health === "pending") return "unknown";
  if (s.health === "stale") return "unknown";
  if (s.disruptedLines > 0 || s.activeAlerts > 0) return s.disruptedLines > 2 ? "major" : "minor";
  return "good";
}

export function sourceNote(s: SourceSummary): string {
  if (s.kind === "schedule") return "Timetable only, no live data";
  if (s.health === "failing") return "Feed failing";
  if (s.health === "stale") return "Data is stale";
  const parts = [];
  if (s.disruptedLines) parts.push(`${s.disruptedLines} lines disrupted`);
  if (s.activeAlerts) parts.push(`${s.activeAlerts} alerts`);
  return parts.length ? parts.join(", ") : "No active disruptions";
}

export function toMapSources(list: SourceSummary[]): MapSource[] {
  return list
    .filter((s) => s.lat != null && s.lon != null)
    .map((s) => ({ id: s.id, name: s.name, city: s.city, lat: s.lat!, lon: s.lon!, tone: sourceTone(s), note: sourceNote(s) }));
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const i of items) {
    const k = key(i);
    (m.get(k) ?? m.set(k, []).get(k)!).push(i);
  }
  return m;
}
