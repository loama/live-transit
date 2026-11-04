import { db } from "../client";
import { clampLimit } from "./common";

export interface SearchHit {
  type: "source" | "station" | "line" | "alert";
  id: string;
  sourceId: string;
  title: string;
  subtitle: string;
  status: string | null;
  score: number;
}

/** Ranked search across operators/cities, stations/airports, lines and active alerts. */
export async function search(q: string, limit?: number): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const sql = db();
  const n = clampLimit(limit, 20, 100);
  const rows = await sql`
    WITH hits AS (
      SELECT 'source' AS type, s.id, s.id AS source_id, s.name AS title,
             concat_ws(' · ', s.city, upper(s.country), s.operator) AS subtitle, NULL::text AS status,
             greatest(similarity(s.name, ${term}), word_similarity(${term}, s.name) * 0.9, similarity(coalesce(s.city, ''), ${term}), word_similarity(${term}, s.operator) * 0.9)
               + CASE WHEN s.city ILIKE ${term} OR s.name ILIKE ${term} THEN 1 ELSE 0 END
               + CASE WHEN (s.name || ' ' || s.operator || ' ' || coalesce(s.city,'')) ILIKE '%' || ${term} || '%' THEN 0.5 ELSE 0 END
               + CASE WHEN s.id LIKE 'gtfs-%' THEN 0 ELSE 0.2 END AS score
      FROM sources s WHERE s.enabled
      UNION ALL
      SELECT 'station', st.station_id, st.source_id, st.name,
             concat_ws(' · ', st.city, upper(st.country), st.mode), st.status,
             greatest(similarity(st.name, ${term}), word_similarity(${term}, st.name) * 0.9) + CASE WHEN upper(st.station_id) = upper(${term}) THEN 2 ELSE 0 END
               + CASE WHEN st.name ILIKE '%' || ${term} || '%' OR st.city ILIKE '%' || ${term} || '%' THEN 0.5 ELSE 0 END
      FROM stations st
      UNION ALL
      SELECT 'line', l.line_id, l.source_id, l.line_name, concat_ws(' · ', s.name, l.status_text), l.status,
             greatest(similarity(l.line_name, ${term}), word_similarity(${term}, l.line_name) * 0.9) + CASE WHEN l.line_name ILIKE ${term} THEN 0.8 ELSE 0 END
      FROM line_status l JOIN sources s ON s.id = l.source_id
      UNION ALL
      SELECT 'alert', a.id, a.source_id, a.title, s.name, a.severity,
             similarity(a.title, ${term}) * 0.8 + CASE WHEN a.title ILIKE '%' || ${term} || '%' THEN 0.3 ELSE 0 END
      FROM alerts a JOIN sources s ON s.id = a.source_id WHERE a.active
    )
    SELECT * FROM hits WHERE score > 0.35 ORDER BY score DESC, title LIMIT ${n}`;
  return rows.map((r) => ({
    type: r.type as SearchHit["type"],
    id: r.id as string,
    sourceId: r.source_id as string,
    title: r.title as string,
    subtitle: (r.subtitle as string) ?? "",
    status: (r.status as string) ?? null,
    score: Math.round(Number(r.score) * 1000) / 1000,
  }));
}
