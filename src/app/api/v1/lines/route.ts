import { z } from "zod";
import { listLines } from "@/db/queries";
import { handler, ok, options, parseQuery, q } from "../_lib";

const schema = z.object({
  sourceId: q.text(200),
  country: q.country,
  mode: q.mode,
  disrupted: z.enum(["true", "false"]).optional(),
});

export const GET = handler(async (req) => {
  const { disrupted, ...f } = parseQuery(req, schema);
  return ok(await listLines({ ...f, disruptedOnly: disrupted === "true" }));
});
export const OPTIONS = options;
