import { overview } from "@/db/queries";
import { handler, ok, options } from "../_lib";

export const GET = handler(async () => ok(await overview()));
export const OPTIONS = options;
