import { z } from "zod";
import data from "@/data/news.json";

export const NEWS_KINDS = ["new_line", "closure", "timetable_change", "network_change", "fares", "other"] as const;

export const newsItemSchema = z.object({
  id: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(2000),
  url: z.string().url(),
  sourceIds: z.array(z.string()).max(50),
  country: z.string().regex(/^[a-z]{2}$/),
  kind: z.enum(NEWS_KINDS),
});

export type NewsItem = z.infer<typeof newsItemSchema>;

export const newsArraySchema = z.array(newsItemSchema);

export function validateNews(data: unknown): NewsItem[] {
  return newsArraySchema.parse(data);
}

export function sortNews(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function filterNews(items: NewsItem[], filters: { country?: string; kind?: string; sourceId?: string }): NewsItem[] {
  let result = items;
  if (filters.country) result = result.filter((item) => item.country === filters.country);
  if (filters.kind) result = result.filter((item) => item.kind === filters.kind);
  if (filters.sourceId) result = result.filter((item) => item.sourceIds.includes(filters.sourceId!));
  return result;
}

/** Every news item, validated at build time and newest first. */
export const allNews: NewsItem[] = sortNews(validateNews(data));
