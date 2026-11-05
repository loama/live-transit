import { z } from "zod";
import { listAlerts } from "@/db/queries";
import { handler, ok, options, parseQuery, q, SEVERITIES } from "../_lib";

const schema = z.object({
  country: q.country,
  city: q.text(100),
  mode: q.mode,
  severity: z.enum(SEVERITIES).optional(),
  minSeverity: z.enum(SEVERITIES).optional(),
  sourceId: q.text(200),
  q: q.text(),
  since: q.date,
  limit: q.limit(500),
  cursor: q.text(500),
});

export const GET = handler(async (req) => {
  const page = await listAlerts(parseQuery(req, schema));
  return ok(page.items, { nextCursor: page.nextCursor });
});
export const OPTIONS = options;
