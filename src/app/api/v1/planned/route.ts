import { plannedSources } from "@/connectors/planned";
import { handler, ok, options } from "../_lib";

export const GET = handler(async () => ok(plannedSources));
export const OPTIONS = options;
