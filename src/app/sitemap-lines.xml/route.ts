import { connection } from "next/server";
import { db } from "@/db/client";
import { siteUrl } from "@/data/site";
import { iso } from "@/db/queries/common";

export async function GET() {
  await connection();
  const base = siteUrl();
  const sql = db();

  const rows = await sql`
    SELECT l.source_id, l.line_id, l.since, l.updated_at, s.last_success_at
    FROM line_status l
    JOIN sources s ON s.id = l.source_id
    WHERE s.enabled
      AND s.last_success_at IS NOT NULL
      AND s.last_success_at > now() - interval '24 hours'
    ORDER BY s.last_success_at DESC, s.country, s.name, l.line_name
    LIMIT 10000`;

  const urls = rows.map((r) => {
    const sourceId = r.source_id as string;
    const lineId = r.line_id as string;
    const lastMod = iso(r.updated_at) || iso(r.since) || iso(r.last_success_at) || new Date().toISOString();
    return `  <url>
    <loc>${base}/n/${encodeURIComponent(sourceId)}/l/${encodeURIComponent(lineId)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.5</priority>
  </url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
