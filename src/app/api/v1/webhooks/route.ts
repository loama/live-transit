import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db/client";
import { FEED_SUBJECTS, latestEventId } from "@/db/queries";
import { assertPublicUrl, verifyEndpoint } from "@/ingest/webhooks";
import { ApiError, handler, json, options } from "../_lib";

const PER_CREATOR_PER_DAY = 5;
const MAX_ACTIVE = 500;

const schema = z.strictObject({
  url: z.string().max(500),
  sourceIds: z.array(z.string().max(200)).max(50).default([]),
  countries: z.array(z.string().regex(/^[a-zA-Z]{2}$/)).max(50).default([]),
  subjects: z.array(z.enum(FEED_SUBJECTS as [string, ...string[]])).max(3).default([]),
});

/** Subscribe a URL to change events. The URL must echo a verification challenge before the subscription exists. */
export const POST = handler(async (req) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  const f = parsed.data;
  const url = (await assertPublicUrl(f.url).catch((e: Error) => { throw new ApiError(400, "bad_request", e.message); })).href;
  const sql = db();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const creator = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  const [{ mine, active }] = await sql`
    SELECT count(*) FILTER (WHERE creator = ${creator} AND created_at > now() - interval '1 day')::int AS mine,
           count(*) FILTER (WHERE disabled_at IS NULL)::int AS active
    FROM webhooks`;
  if (mine >= PER_CREATOR_PER_DAY) throw new ApiError(429, "rate_limited", `At most ${PER_CREATOR_PER_DAY} subscriptions per day`);
  if (active >= MAX_ACTIVE) throw new ApiError(503, "capacity", "Subscriptions are at capacity");
  const secret = randomBytes(24).toString("hex");
  await verifyEndpoint(url, secret, randomBytes(16).toString("hex")).catch((e: Error) => { throw new ApiError(400, "verification_failed", e.message); });
  const id = randomUUID();
  await sql`
    INSERT INTO webhooks (id, url, secret, source_ids, countries, subjects, creator, last_event_id)
    VALUES (${id}, ${url}, ${secret}, ${f.sourceIds}, ${f.countries.map((c) => c.toLowerCase())}, ${f.subjects}, ${creator}, ${await latestEventId()}::bigint)`;
  return json({ data: { id, secret, url, sourceIds: f.sourceIds, countries: f.countries, subjects: f.subjects } }, 201, null);
});
export const OPTIONS = options;
