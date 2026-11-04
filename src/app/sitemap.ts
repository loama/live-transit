import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listSources, listStations } from "@/db/queries";
import { siteUrl } from "@/data/site";

const STATIC = ["", "/map", "/disruptions", "/airports", "/coverage", "/status", "/developers", "/about"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = siteUrl();
  const now = new Date();
  const pages: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: `${base}${p}`, lastModified: now, changeFrequency: "hourly", priority: p === "" ? 1 : 0.7 }));
  try {
    const [sources, airports] = await Promise.all([listSources(), listStations({ mode: "air", limit: 1000 })]);
    for (const s of sources) pages.push({ url: `${base}/n/${encodeURIComponent(s.id)}`, lastModified: s.lastSuccessAt ? new Date(s.lastSuccessAt) : now, changeFrequency: "hourly", priority: 0.6 });
    for (const a of airports) pages.push({ url: `${base}/airports/${a.stationId}`, lastModified: new Date(a.updatedAt), changeFrequency: "hourly", priority: 0.6 });
  } catch {
    // The database may be unreachable; the static routes are still valid.
  }
  return pages;
}
