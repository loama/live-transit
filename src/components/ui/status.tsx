import type { ReactNode } from "react";

export type Tone = "good" | "minor" | "major" | "severe" | "unknown";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-good bg-good-bg",
  minor: "text-minor bg-minor-bg",
  major: "text-major bg-major-bg",
  severe: "text-severe bg-severe-bg",
  unknown: "text-unknown bg-unknown-bg",
};

export const TONE_VAR: Record<Tone, string> = {
  good: "var(--good)", minor: "var(--minor)", major: "var(--major)", severe: "var(--severe)", unknown: "var(--unknown)",
};

export function lineTone(status: string): Tone {
  switch (status) {
    case "good": case "on_time": case "live": return "good";
    case "minor": case "delays": case "stale": return "minor";
    case "major": case "major_delays": return "major";
    case "suspended": case "closed": case "cancelled": case "failing": return "severe";
    default: return "unknown";
  }
}

/** Delay thresholds: under 15 min is fine, 15-44 amber, 45+ orange-red. Cancelled and diverted are red. */
export function delayTone(status: string, delayMinutes?: number | null): Tone {
  if (/cancel|divert|suspend|closed/i.test(status)) return "severe";
  const m = delayMinutes ?? 0;
  if (m >= 45) return "major";
  if (m >= 15) return "minor";
  if (status === "major_delays") return "major";
  if (status === "delays" || status === "delayed") return m > 0 ? "good" : "minor";
  return lineTone(status);
}

export function severityTone(sev: string): Tone {
  return sev === "severe" ? "severe" : sev === "major" ? "major" : sev === "minor" ? "minor" : "unknown";
}

const LABEL: Record<string, string> = {
  good: "Good service", minor: "Minor delays", major: "Major delays", suspended: "Suspended", closed: "Closed",
  unknown: "Unknown", on_time: "On time", delays: "Delays", major_delays: "Major delays", cancelled: "Cancelled",
  info: "Info", severe: "Severe", live: "Live", stale: "Stale", failing: "Failing", pending: "Pending",
};

export const statusLabel = (s: string) => LABEL[s] ?? s.replace(/_/g, " ");

export function Pill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function StatusPill({ status, label, delayMinutes }: { status: string; label?: string; delayMinutes?: number | null }) {
  const tone = delayMinutes === undefined ? lineTone(status) : delayTone(status, delayMinutes);
  return <Pill tone={tone}>{label ?? statusLabel(status)}</Pill>;
}

export function SeverityPill({ severity }: { severity: string }) {
  return <Pill tone={severityTone(severity)}>{statusLabel(severity)}</Pill>;
}

export function HealthBadge({ health }: { health: string }) {
  return <StatusPill status={health} />;
}
