import { z } from "zod";
import { handler, ok, options, parseQuery, q } from "../_lib";
import { NEWS_KINDS, allNews, filterNews } from "@/lib/news";

const schema = z.object({
  country: q.country,
  kind: z.enum(NEWS_KINDS).optional(),
  sourceId: q.text(200),
  limit: q.limit(100),
  since: q.date,
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const all = allNews;
  const filtered = filterNews(all, { country: q.country, kind: q.kind, sourceId: q.sourceId });
  const sinceDate = q.since ? new Date(q.since) : null;
  const items = filtered
    .filter((item) => !sinceDate || new Date(item.date) >= sinceDate)
    .slice(0, q.limit ?? 100);
  return ok(items);
});

export const OPTIONS = options;
