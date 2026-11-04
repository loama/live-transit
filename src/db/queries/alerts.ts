import { db } from "../client";
import { clampLimit, fold, decodeCursor, encodeCursor, iso, type Page } from "./common";

type Row = Record<string, unknown>;

export interface AlertItem {
  sourceId: string;
  sourceName: string;
  country: string;
  city: string | null;
  id: string;
  severity: string;
  effect: string | null;
  cause: string | null;
  title: string;
  description: string | null;
  url: string | null;
  modes: string[];
  routes: string[];
  stops: string[];
  activeFrom: string | null;
  activeUntil: string | null;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export function mapAlert(r: Row): AlertItem {
  return {
    sourceId: r.source_id as string,
    sourceName: (r.source_name as string) ?? (r.source_id as string),
    country: (r.country as string) ?? "",
    city: (r.city as string) ?? null,
    id: r.id as string,
    severity: r.severity as string,
    effect: (r.effect as string) ?? null,
    cause: (r.cause as string) ?? null,
    title: r.title as string,
    description: (r.description as string) ?? null,
    url: (r.url as string) ?? null,
    modes: (r.modes as string[]) ?? [],
    routes: (r.routes as string[]) ?? [],
    stops: (r.stops as string[]) ?? [],
    activeFrom: iso(r.active_from),
    activeUntil: iso(r.active_until),
    active: r.active as boolean,
    firstSeenAt: iso(r.first_seen_at)!,
    lastSeenAt: iso(r.last_seen_at)!,
    resolvedAt: iso(r.resolved_at),
  };
}

export interface AlertFilter {
  country?: string;
  region?: string;
  city?: string;
  mode?: string;
  severity?: string;
  /** Minimum severity: info < minor < major < severe. */
  minSeverity?: string;
  sourceId?: string;
  q?: string;
  active?: boolean;
  since?: Date;
  limit?: number;
  cursor?: string;
}

const SEV_RANK = `CASE a.severity WHEN 'severe' THEN 4 WHEN 'major' THEN 3 WHEN 'minor' THEN 2 ELSE 1 END`;
const RANK: Record<string, number> = { info: 1, minor: 2, major: 3, severe: 4 };

/** Active alerts ordered by severity, then most recently first seen. Keyset paginated. */
export async function listAlerts(f: AlertFilter = {}): Promise<Page<AlertItem>> {
  const sql = db();
  const limit = clampLimit(f.limit, 50, 500);
  const cur = decodeCursor(f.cursor);
  const rows = await sql.unsafe(
    `SELECT a.*, s.name AS source_name, s.country, s.city, ${SEV_RANK} AS rank
     FROM alerts a JOIN sources s ON s.id = a.source_id
     WHERE a.active = $1
       AND ($2::text IS NULL OR s.country = $2)
       AND ($3::text IS NULL OR ${fold('s.city')} LIKE ${fold('$3')})
       AND ($4::text IS NULL OR $4 = ANY(a.modes))
       AND ($5::text IS NULL OR a.severity = $5)
       AND ($6::text IS NULL OR a.source_id = $6)
       AND ($7::text IS NULL OR (a.title || ' ' || coalesce(a.description,'') || ' ' || array_to_string(a.routes,' ')) ILIKE '%' || $7 || '%')
       AND ($8::timestamptz IS NULL OR a.first_seen_at >= $8)
       AND ${SEV_RANK} >= $9
       AND ($10::int IS NULL OR (${SEV_RANK}, a.first_seen_at, a.source_id || '/' || a.id) < ($10, $11::timestamptz, $12))
       AND ($14::text IS NULL OR s.region = $14)
     ORDER BY rank DESC, a.first_seen_at DESC, a.source_id || '/' || a.id DESC
     LIMIT $13`,
    [
      f.active ?? true,
      f.country?.toLowerCase() ?? null,
      f.city ?? null,
      f.mode ?? null,
      f.severity ?? null,
      f.sourceId ?? null,
      f.q ?? null,
      f.since ?? null,
      RANK[f.minSeverity ?? "info"] ?? 1,
      (cur?.[0] as number) ?? null,
      (cur?.[1] as string) ?? null,
      (cur?.[2] as string) ?? null,
      limit + 1,
      f.region ?? null,
    ],
  );
  const items = rows.slice(0, limit).map(mapAlert);
  const last = rows[limit - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor([last.rank as number, iso(last.first_seen_at)!, `${last.source_id}/${last.id}`])
        : undefined,
  };
}

export interface ChangeItem {
  id: string;
  sourceId: string;
  sourceName: string;
  country: string;
  city: string | null;
  subject: "line" | "station";
  subjectId: string;
  subjectName: string;
  fromStatus: string | null;
  toStatus: string;
  statusText: string | null;
  at: string;
}

/** Status transitions of lines and stations, newest first. */
export async function recentChanges(f: { since?: Date; sourceId?: string; country?: string; limit?: number } = {}) {
  const sql = db();
  const limit = clampLimit(f.limit, 100, 500);
  const rows = await sql`
    SELECT e.*, s.name AS source_name, s.country, s.city FROM status_events e JOIN sources s ON s.id = e.source_id
    WHERE (${f.since ?? null}::timestamptz IS NULL OR e.at >= ${f.since ?? null})
      AND (${f.sourceId ?? null}::text IS NULL OR e.source_id = ${f.sourceId ?? null})
      AND (${f.country?.toLowerCase() ?? null}::text IS NULL OR s.country = ${f.country?.toLowerCase() ?? null})
    ORDER BY e.at DESC LIMIT ${limit}`;
  return rows.map(
    (r): ChangeItem => ({
      id: String(r.id),
      sourceId: r.source_id as string,
      sourceName: r.source_name as string,
      country: r.country as string,
      city: (r.city as string) ?? null,
      subject: r.subject as "line" | "station",
      subjectId: r.subject_id as string,
      subjectName: r.subject_name as string,
      fromStatus: (r.from_status as string) ?? null,
      toStatus: r.to_status as string,
      statusText: (r.status_text as string) ?? null,
      at: iso(r.at)!,
    }),
  );
}
