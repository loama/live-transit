import { db } from "@/db/client";
import { importDueStatic } from "@/ingest/static";
import { authorized } from "../auth";

export const maxDuration = 300;

/** Refreshes static GTFS line catalogs: the stalest due feeds, one at a time, within the time budget. */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  const summary = await importDueStatic(db(), { budgetMs: 270_000 });
  return Response.json(summary);
}
