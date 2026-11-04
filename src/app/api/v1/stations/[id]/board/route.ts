import { z } from "zod";
import { getBoard, getStation } from "@/db/queries";
import { handler, notFound, ok, options, parseQuery, q } from "../../../_lib";

const schema = z.object({
  direction: z.enum(["departure", "arrival"]).optional(),
  from: q.date,
  limit: q.limit(500),
});

export const GET = handler(async (req, { id }) => {
  const f = parseQuery(req, schema);
  if (!(await getStation(id))) return notFound(`Unknown station "${id}"`);
  return ok(await getBoard({ stationId: id, ...f }));
});
export const OPTIONS = options;
