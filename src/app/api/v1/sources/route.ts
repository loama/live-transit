import { z } from "zod";
import { listSources } from "@/db/queries";
import { handler, HEALTHS, ok, options, parseQuery, q } from "../_lib";

const schema = z.object({
  country: q.country,
  mode: q.mode,
  region: q.text(50),
  q: q.text(),
  health: z.enum(HEALTHS).optional(),
});

export const GET = handler(async (req) => {
  const items = await listSources(parseQuery(req, schema));
  return ok(items, { attribution: [...new Set(items.map((s) => s.attribution).filter((a): a is string => !!a))] });
});
export const OPTIONS = options;
