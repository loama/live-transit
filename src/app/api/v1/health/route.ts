import { health } from "@/db/queries";
import { handler, ok, options } from "../_lib";

export const GET = handler(async () => {
  const h = await health();
  return ok(h, { count: h.sources.length });
});
export const OPTIONS = options;
