import { z } from "zod";
import { listRoutes } from "@/db/queries";
import { ApiError, handler, ok, options, parseBbox, parseQuery, q } from "../_lib";

const schema = z.object({
  sourceId: q.text(100),
  bbox: z.string().optional(),
  mode: q.mode,
  geometry: z.enum(["true", "false"]).optional(),
  limit: q.limit(5000),
});

export const GET = handler(async (req) => {
  const f = parseQuery(req, schema);
  if (!f.sourceId && !f.bbox) throw new ApiError(400, "bad_request", "Provide sourceId, bbox, or both");
  const items = await listRoutes({
    sourceId: f.sourceId,
    bbox: f.bbox ? parseBbox(f.bbox) : undefined,
    mode: f.mode,
    geometry: f.geometry === "true",
    limit: f.limit,
  });
  return ok(items);
});
export const OPTIONS = options;
