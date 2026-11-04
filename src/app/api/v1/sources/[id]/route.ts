import { getSource } from "@/db/queries";
import { handler, notFound, ok, options } from "../../_lib";

export const GET = handler(async (_req, { id }) => {
  const s = await getSource(id);
  if (!s) return notFound(`Unknown source "${id}"`);
  return ok(s, { attribution: s.attribution ? [s.attribution] : [] });
});
export const OPTIONS = options;
