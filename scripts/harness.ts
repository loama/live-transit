import { makeContext } from "@/lib/http";
import { MODES, type Connector, type IngestResult } from "@/lib/types";

const ISO_COUNTRY = /^[a-z]{2}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)+$/;

export function validateMeta(c: Connector) {
  const m = c.meta;
  const errs: string[] = [];
  if (!ID.test(m.id)) errs.push(`bad id ${m.id}`);
  if (!ISO_COUNTRY.test(m.country)) errs.push(`bad country ${m.country}`);
  if (!m.modes.length || m.modes.some((x) => !MODES.includes(x))) errs.push(`bad modes ${m.modes}`);
  if (!/^https?:\/\//.test(m.homepage)) errs.push("homepage must be a URL");
  if (m.intervalMinutes < 1) errs.push("interval must be >= 1");
  if (errs.length) throw new Error(`${m.id}: ${errs.join("; ")}`);
}

/** Validate a result against the shape the database expects. Throws with every problem found. */
export function validateResult(id: string, r: IngestResult) {
  const errs: string[] = [];
  const isDate = (d: unknown) => d instanceof Date && !Number.isNaN(d.getTime());
  for (const a of r.alerts ?? []) {
    if (!a.id || !a.title) errs.push(`alert missing id/title: ${JSON.stringify(a).slice(0, 120)}`);
    if (a.activeFrom && !isDate(a.activeFrom)) errs.push(`alert ${a.id} bad activeFrom`);
  }
  for (const l of r.lines ?? []) if (!l.lineId || !l.lineName || !l.status) errs.push(`line missing fields ${l.lineId}`);
  for (const v of r.vehicles ?? []) {
    if (!v.id || !Number.isFinite(v.lat) || !Number.isFinite(v.lon) || Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180)
      errs.push(`vehicle bad ${v.id} ${v.lat},${v.lon}`);
  }
  for (const d of r.departures ?? []) {
    if (!d.id || !d.stationId || !d.service || !isDate(d.scheduledAt)) errs.push(`departure bad ${JSON.stringify(d).slice(0, 160)}`);
    if (d.estimatedAt && !isDate(d.estimatedAt)) errs.push(`departure ${d.id} bad estimatedAt`);
  }
  for (const s of r.stations ?? []) if (!s.stationId || !s.name || !s.status) errs.push(`station bad ${s.stationId}`);
  if (errs.length) throw new Error(`${id}: ${errs.slice(0, 10).join("\n")}${errs.length > 10 ? `\n...${errs.length - 10} more` : ""}`);
}

/** Run a connector against its live endpoint and validate the output. Use in tests. */
export async function runConnector(c: Connector): Promise<IngestResult> {
  validateMeta(c);
  const r = await c.fetch(makeContext(AbortSignal.timeout(45_000)));
  validateResult(c.meta.id, r);
  return r;
}
