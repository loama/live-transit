import { z } from "zod";
import { findService, normalizeService } from "@/db/queries";
import { ApiError, handler, ok, options, parseQuery, q } from "../../_lib";

const schema = z.object({ limit: q.limit(200) });

export const GET = handler(async (req, { q: raw }) => {
  const { limit } = parseQuery(req, schema);
  const service = decodeURIComponent(raw);
  if (normalizeService(service).length < 2) throw new ApiError(400, "bad_request", "q: must be at least 2 characters");
  return ok(await findService(service, limit));
});
export const OPTIONS = options;
