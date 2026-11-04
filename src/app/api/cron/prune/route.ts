import { db } from "@/db/client";
import { prune } from "@/ingest/runner";
import { authorized } from "../auth";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  await prune(db());
  return Response.json({ ok: true });
}
