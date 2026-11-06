import { connection } from "next/server";
import { listStations } from "@/db/queries";
import { siteUrl } from "@/data/site";

export async function GET() {
  await connection();
  const base = siteUrl();
  const airports = await listStations({ mode: "air", limit: 1000 });

  const urls = airports.map((a) => {
    return `  <url>
    <loc>${base}/airports/${a.stationId}</loc>
    <lastmod>${a.updatedAt}</lastmod>
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
