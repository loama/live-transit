import type { DepartureItem } from "@/db/queries";
import { TONE_VAR, type Tone } from "@/components/ui/status";

export function flightTone(d: Pick<DepartureItem, "status" | "delayMinutes">): Tone {
  if (/cancel|diverted/i.test(d.status)) return "severe";
  if (d.status === "delayed" || (d.delayMinutes ?? 0) >= 45) return (d.delayMinutes ?? 0) >= 45 ? "major" : "minor";
  if ((d.delayMinutes ?? 0) >= 15) return "minor";
  if (d.status === "boarding" || d.status === "on_time") return "good";
  return "unknown";
}

const fmt = (iso: string, utc: boolean) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(utc ? { timeZone: "UTC" } : {}) }).format(new Date(iso));

const label = (s: string) => s.replace(/_/g, " ").toUpperCase();

export function BoardRow({ d, utc }: { d: DepartureItem; utc: boolean }) {
  const tone = flightTone(d);
  const changed = d.estimatedAt && fmt(d.estimatedAt, utc) !== fmt(d.scheduledAt, utc);
  const cancelled = tone === "severe";
  return (
    <li className="grid grid-cols-[3.5rem_4.5rem_1fr_auto] items-center gap-x-3 border-b border-border px-3 py-2.5 font-mono text-sm sm:grid-cols-[4rem_5.5rem_1fr_6rem_9rem] sm:px-4">
      <span className={`num ${changed ? "text-faint line-through" : "font-semibold"} ${cancelled ? "line-through" : ""}`}>{fmt(d.scheduledAt, utc)}</span>
      <span className="font-semibold tracking-wide">{d.service}</span>
      <span className="min-w-0 font-sans">
        <span className="block truncate font-medium">{d.counterpart ?? "Unknown"}</span>
        <span className="flex gap-2 text-xs text-muted">
          <span className="truncate">{d.carrier ?? ""}</span>
          {changed && d.estimatedAt && <span className="num shrink-0 font-mono font-semibold" style={{ color: TONE_VAR[tone] }}>{/departed|landed|arrived|taxied/.test(d.status) ? "actual" : "est."} {fmt(d.estimatedAt, utc)}</span>}
        </span>
      </span>
      <span className="hidden text-center text-xs text-muted sm:block">
        {d.platform ? <><span className="mr-1 font-sans text-faint">Gate</span><span className="num font-semibold text-fg">{d.platform}</span></> : <span aria-label="No gate">-</span>}
      </span>
      <span className="justify-self-end text-right text-xs font-semibold" style={{ color: TONE_VAR[tone] }}>
        {label(d.statusText && tone !== "good" && tone !== "unknown" ? d.statusText.split(" ")[0] : d.status)}
        {d.delayMinutes && d.delayMinutes >= 5 ? <span className="num block font-normal">+{d.delayMinutes} min</span> : null}
      </span>
    </li>
  );
}
