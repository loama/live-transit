import type { MetadataRoute } from "next";
import { siteUrl } from "@/data/site";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/cron/"] }],
    sitemap: [
      `${base}/sitemap.xml`,
      `${base}/sitemap-networks.xml`,
      `${base}/sitemap-airports.xml`,
      `${base}/sitemap-lines.xml`,
    ],
  };
}
