import { timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { iso } from "@/db/queries";
import { handler, json, notFound, options } from "../../_lib";

/** The subscription's secret, sent as a bearer token, authorizes reading and deleting it. */
async function owned(req: Request, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [h] = await db()`SELECT * FROM webhooks WHERE id = ${id}`;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(h ? (h.secret as string) : "");
  if (!h || given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return h;
}

export const GET = handler(async (req, { id }) => {
  const h = await owned(req, id);
  if (!h) return notFound("Unknown subscription, or wrong secret");
  return json({
    data: {
      id: h.id, url: h.url, sourceIds: h.source_ids, countries: h.countries, subjects: h.subjects, createdAt: iso(h.created_at),
      lastEventId: String(h.last_event_id), lastDelivery: iso(h.last_delivery), failures: h.failures, lastError: h.last_error ?? null,
      active: !h.disabled_at,
    },
  }, 200, null);
});

export const DELETE = handler(async (req, { id }) => {
  const h = await owned(req, id);
  if (!h) return notFound("Unknown subscription, or wrong secret");
  await db()`DELETE FROM webhooks WHERE id = ${id}`;
  return new Response(null, { status: 204 });
});
export const OPTIONS = options;
