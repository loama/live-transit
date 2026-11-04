import { getStation } from "@/db/queries";
import { handler, notFound, ok, options } from "../../_lib";

export const GET = handler(async (_req, { id }) => {
  const s = await getStation(id);
  if (!s) return notFound(`Unknown station "${id}"`);
  return ok(s);
});
export const OPTIONS = options;
