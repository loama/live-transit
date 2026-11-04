import type { LineState, Severity } from "@/lib/types";

/** Lowercase, accent-free text for matching published status labels. */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Maps the Portuguese situation labels used by Brazilian rail operators. */
export function portugueseLineState(text: string): LineState {
  const t = norm(text);
  if (t.includes("normal")) return "good";
  if (t.includes("paralis") || t.includes("interromp")) return "suspended";
  if (t.includes("encerrad")) return "closed";
  if (t.includes("velocidade reduzida") || t.includes("diferenciada") || t.includes("transitoria") || t.includes("atraso")) return "minor";
  if (t.includes("parcial")) return "major";
  return "unknown";
}

export function severityForState(status: LineState): Severity {
  if (status === "suspended" || status === "closed") return "severe";
  return status === "major" ? "major" : "minor";
}

/** Parse a wall-clock time in a fixed UTC offset such as "-03:00". */
export function parseLocal(y: string, mo: string, d: string, h: string, mi: string, s: string, offset: string): Date | undefined {
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
