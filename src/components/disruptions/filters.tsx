import Link from "next/link";
import { MODE_LABEL, countryName } from "@/components/ui/format";

export interface Filters { country?: string; mode?: string; severity?: string }

const SEVERITIES = [["severe", "Severe"], ["major", "Major"], ["minor", "Minor"], ["info", "Info"]];
const MODES = ["air", "rail", "metro", "tram", "bus", "ferry", "cable"];

const sel = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg";

export function DisruptionFilters({ f, countries }: { f: Filters; countries: string[] }) {
  const active = Boolean(f.country || f.mode || f.severity);
  return (
    <form action="/disruptions" method="get" className="grid gap-3 py-5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <label className="text-xs font-medium text-muted">Country
        <select name="country" defaultValue={f.country ?? ""} className={`${sel} mt-1`}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-muted">Mode
        <select name="mode" defaultValue={f.mode ?? ""} className={`${sel} mt-1`}>
          <option value="">All modes</option>
          {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-muted">Severity
        <select name="severity" defaultValue={f.severity ?? ""} className={`${sel} mt-1`}>
          <option value="">All severities</option>
          {SEVERITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" className="h-10 rounded-lg bg-fg px-4 text-sm font-medium text-bg hover:opacity-90">Apply</button>
        {active && <Link href="/disruptions" className="grid h-10 place-items-center rounded-lg border border-border px-3 text-sm text-muted hover:text-fg">Clear</Link>}
      </div>
    </form>
  );
}
