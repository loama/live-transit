import { db } from "../client";
import { clampLimit, iso } from "./common";
import { siteUrl } from "@/data/site";

// The change feed: line and station status transitions and alerts opening or resolving, in order. Read by the
// event stream, webhooks and the MCP watch tool, each with its own cursor (the event id).

export type FeedSubject = "line" | "station" | "alert";
export const FEED_SUBJECTS: FeedSubject[] = ["line", "station", "alert"];

export interface FeedEvent {
  /** Monotonic cursor; pass it back as `after` (or Last-Event-ID) to resume. */
  id: string;
  at: string;
  sourceId: string;
  sourceName: string;
  country: string;
  subject: FeedSubject;
  subjectId: string;
  subjectName: string;
  from: string | null;
  to: string;
  text: string | null;
  severity: string | null;
  /** Page on this site for the network or line. */
  url: string;
}

export interface FeedFilter {
  after?: string;
  sourceIds?: string[];
  countries?: string[];
  subjects?: FeedSubject[];
  limit?: number;
}

export async function feedSince(f: FeedFilter = {}): Promise<FeedEvent[]> {
  const sql = db();
  const after = f.after && /^\d+$/.test(f.after) ? f.after : null;
  const rows = await sql`
    SELECT e.id, e.at, e.source_id, s.name AS source_name, s.country, e.subject, e.subject_id, e.subject_name,
           e.from_status, e.to_status, e.status_text, e.severity
    FROM status_events e JOIN sources s ON s.id = e.source_id
    WHERE (${after}::bigint IS NULL OR e.id > ${after}::bigint)
      AND (${f.sourceIds?.length ? f.sourceIds : null}::text[] IS NULL OR e.source_id = ANY(${f.sourceIds ?? []}))
      AND (${f.countries?.length ? f.countries.map((c) => c.toLowerCase()) : null}::text[] IS NULL OR s.country = ANY(${f.countries?.map((c) => c.toLowerCase()) ?? []}))
      AND (${f.subjects?.length ? f.subjects : null}::text[] IS NULL OR e.subject = ANY(${f.subjects ?? []}))
    ORDER BY e.id ${after ? sql`ASC` : sql`DESC`}
    LIMIT ${clampLimit(f.limit, 100, 500)}`;
  const base = siteUrl();
  const events = rows.map((r): FeedEvent => ({
    id: String(r.id),
    at: iso(r.at)!,
    sourceId: r.source_id as string,
    sourceName: r.source_name as string,
    country: r.country as string,
    subject: r.subject as FeedSubject,
    subjectId: r.subject_id as string,
    subjectName: r.subject_name as string,
    from: (r.from_status as string) ?? null,
    to: r.to_status as string,
    text: (r.status_text as string) ?? null,
    severity: (r.severity as string) ?? null,
    url: r.subject === "line"
      ? `${base}/n/${encodeURIComponent(r.source_id as string)}/l/${encodeURIComponent(r.subject_id as string)}`
      : `${base}/n/${encodeURIComponent(r.source_id as string)}${r.subject === "alert" ? "#alerts" : ""}`,
  }));
  // Without a cursor the newest events are returned, oldest first, so a client can start from the last one.
  return after ? events : events.reverse();
}

/** Id of the newest event, the starting cursor for a new subscription. */
export async function latestEventId(): Promise<string> {
  const [r] = await db()`SELECT coalesce(max(id), 0) AS id FROM status_events`;
  return String(r.id);
}
