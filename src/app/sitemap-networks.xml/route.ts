import { connection } from "next/server";
import { listSources } from "@/db/queries";
import { siteUrl } from "@/data/site";

export async function GET() {
  await connection();
  const base = siteUrl();
  const sources = await listSources();
  const now = new Date().toISOString();

  const urls = sources.map((s) => {
    const lastMod = s.lastSuccessAt || now;
    return `  <url>
    <loc>${base}/n/${encodeURIComponent(s.id)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.6</priority>
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
