import { getLine } from "@/db/queries";
import { handler, notFound, ok, options } from "../../../../_lib";

export const GET = handler(async (_req, { id, lineId }) => {
  const line = await getLine(id, lineId);
  if (!line) return notFound(`Unknown line "${lineId}" in source "${id}"`);
  return ok(line);
});
export const OPTIONS = options;
