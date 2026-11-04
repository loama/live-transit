import { openapi } from "../openapi";
import { handler, json, options } from "../_lib";

export const GET = handler(async () => json(openapi, 200, "public, s-maxage=3600, stale-while-revalidate=86400"));
export const OPTIONS = options;
