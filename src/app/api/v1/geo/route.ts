import { z } from "zod";
import { geoTiles } from "@/db/queries";
import { handler, ok, options, parseBbox, parseQuery, q } from "../_lib";

const schema = z.object({ bbox: z.string({ error: "is required" }), sourceId: q.text(200), limit: q.limit(2000) });

export const GET = handler(async (req) => {
  const f = parseQuery(req, schema);
  return ok(await geoTiles({ bbox: parseBbox(f.bbox), sourceId: f.sourceId, limit: f.limit }));
});
export const OPTIONS = options;
