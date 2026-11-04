import { z } from "zod";
import { search } from "@/db/queries";
import { handler, ok, options, parseQuery, q } from "../_lib";

const schema = z.object({
  q: z.string({ error: "is required" }).min(2, "must be at least 2 characters").max(200),
  limit: q.limit(100),
});

export const GET = handler(async (req) => {
  const { q: term, limit } = parseQuery(req, schema);
  return ok(await search(term, limit));
});
export const OPTIONS = options;
