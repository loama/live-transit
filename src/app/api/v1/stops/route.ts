import { z } from "zod";
import { stopsInBbox } from "@/db/queries";
import { handler, ok, options, parseBbox, parseQuery, q } from "../_lib";

const schema = z.object({ bbox: z.string({ error: "is required" }), limit: q.limit(10000) });

export const GET = handler(async (req) => {
  const f = parseQuery(req, schema);
  return ok(await stopsInBbox(parseBbox(f.bbox), f.limit));
});
export const OPTIONS = options;
