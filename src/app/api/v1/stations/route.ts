import { z } from "zod";
import { listStations } from "@/db/queries";
import { handler, ok, options, parseQuery, q } from "../_lib";

const schema = z.object({
  mode: q.mode,
  country: q.country,
  status: z.enum(["normal", "delays", "major_delays", "closed", "unknown"]).optional(),
  q: q.text(),
  limit: q.limit(1000),
});

export const GET = handler(async (req) => ok(await listStations(parseQuery(req, schema))));
export const OPTIONS = options;
