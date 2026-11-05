import { z } from "zod";
import { recentChanges } from "@/db/queries";
import { handler, ok, options, parseQuery, q } from "../_lib";

const schema = z.object({
  since: q.date,
  sourceId: q.text(200),
  country: q.country,
  limit: q.limit(500),
});

export const GET = handler(async (req) => ok(await recentChanges(parseQuery(req, schema))));
export const OPTIONS = options;
