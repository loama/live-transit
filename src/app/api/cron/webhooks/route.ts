import { db } from "@/db/client";
import { deliverWebhooks } from "@/ingest/webhooks";
import { authorized } from "../auth";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  return Response.json(await deliverWebhooks(db(), Date.now() + 50_000));
}
