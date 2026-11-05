import { db } from "../client";
import { clampLimit, fold } from "./common";

const FROM = "áàâäãåéèêëíìîïóòôöõøúùûüýñçšžłß";
const TO = "aaaaaaeeeeiiiiooooouuuuyncszls";
/** fold() applied in JS, so the search term can be a plain parameter. */
const foldJs = (s: string) => [...s.toLowerCase()].map((c) => (FROM.includes(c) ? TO[FROM.indexOf(c)] : c)).join("");

export interface SearchHit {
  type: "source" | "station" | "line" | "stop" | "alert";
  id: string;
  sourceId: string;
  title: string;
  subtitle: string;
  status: string | null;
  score: number;
  /** Position, for stops. */
  lat?: number;
  lon?: number;
}

/**
 * Ranked search across operators/cities, stations/airports, lines, stops and active alerts. Lines and stops are
 * large tables, so they are filtered through their trigram indexes before scoring.
 */
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
               + CASE WHEN s.id LIKE 'gtfs-%' OR s.id LIKE 'sched-%' THEN 0 ELSE 0.2 END AS score,
             NULL::float8 AS lat, NULL::float8 AS lon
      FROM sources s WHERE s.enabled
      UNION ALL
      SELECT 'station', st.station_id, st.source_id, st.name,
             concat_ws(' · ', st.city, upper(st.country), st.mode), st.status,
             greatest(similarity(st.name, ${term}), word_similarity(${term}, st.name) * 0.9) + CASE WHEN upper(st.station_id) = upper(${term}) THEN 2 ELSE 0 END
               + CASE WHEN st.name ILIKE '%' || ${term} || '%' OR st.city ILIKE '%' || ${term} || '%' THEN 0.5 ELSE 0 END,
             NULL::float8, NULL::float8
      FROM stations st
      UNION ALL
      SELECT 'line', l.line_id, l.source_id, l.line_name, concat_ws(' · ', s.name, l.status_text), l.status,
             greatest(similarity(l.line_name, ${term}), word_similarity(${term}, l.line_name) * 0.9) + CASE WHEN l.line_name ILIKE ${term} THEN 0.8 ELSE 0 END,
             NULL::float8, NULL::float8
      FROM lines_v l JOIN sources s ON s.id = l.source_id
      WHERE lower(l.line_name) % lower(${term}) OR lower(l.line_name) LIKE '%' || lower(${term}) || '%'
      UNION ALL
      SELECT * FROM (
        SELECT DISTINCT ON (t.source_id, lower(u.name)) 'stop', u.name, t.source_id, u.name,
               concat_ws(' · ', s.city, upper(s.country), s.name), NULL::text,
               greatest(similarity(lower(u.name), lower(${term})), word_similarity(lower(${term}), lower(u.name)) * 0.9)
                 + CASE WHEN lower(u.name) = lower(${term}) THEN 0.6 ELSE 0 END
                 + CASE WHEN lower(u.name) LIKE lower(${term}) || '%' THEN 0.2 ELSE 0 END - 0.1,
               u.lat::float8, u.lon::float8
        FROM stop_tiles t JOIN sources s ON s.id = t.source_id,
             unnest(string_to_array(t.names, E'\n'), t.lats, t.lons) AS u(name, lat, lon)
        WHERE ${sql.unsafe(fold("t.names"))} LIKE '%' || ${foldJs(term)} || '%'
          AND ${sql.unsafe(fold("u.name"))} LIKE '%' || ${foldJs(term)} || '%'
        ORDER BY t.source_id, lower(u.name)
        LIMIT 400
      ) stop_hits
      UNION ALL
      SELECT 'alert', a.id, a.source_id, a.title, s.name, a.severity,
             similarity(a.title, ${term}) * 0.8 + CASE WHEN a.title ILIKE '%' || ${term} || '%' THEN 0.3 ELSE 0 END,
             NULL::float8, NULL::float8
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
    ...(r.lat != null ? { lat: r.lat as number, lon: r.lon as number } : {}),
  }));
}
