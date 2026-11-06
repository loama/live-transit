import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteUrl } from "@/data/site";

const STATIC = ["", "/map", "/disruptions", "/news", "/airports", "/coverage", "/status", "/developers", "/about"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = siteUrl();
  const now = new Date();
  return STATIC.map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: p === "" ? 1 : 0.7,
  }));
}
