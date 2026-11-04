import { db } from "@/db/client";
import { runDue } from "@/ingest/runner";
import { authorized } from "../auth";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  const summary = await runDue(db(), { budgetMs: 270_000 });
  return Response.json(summary);
}
