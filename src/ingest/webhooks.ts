import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type postgres from "postgres";
import { feedSince, latestEventId, type FeedSubject } from "@/db/queries";
import { USER_AGENT } from "@/lib/http";

// Webhook delivery. Subscribers choose the URL, so every request is checked to go to a public HTTPS address, never
// follows redirects, and is signed so receivers can verify it came from here.

const TIMEOUT_MS = 8_000;
const MAX_FAILURES = 20;
const BATCH = 100;

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

/** Throws unless the URL is HTTPS and every address its host resolves to is public. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("url must be a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("url must use https");
  if (url.username || url.password) throw new Error("url must not contain credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new Error("url host does not resolve");
  if (addresses.some(privateAddress)) throw new Error("url must point to a public address");
  return url;
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`, as Stripe-style receivers expect. */
export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

export async function post(url: string, secret: string, payload: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  await assertPublicUrl(url);
  const body = JSON.stringify(payload);
  const r = await fetch(url, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT, "X-Live-Transit-Signature": sign(secret, body) },
    body,
  });
  const text = (await r.text().catch(() => "")).slice(0, 2000);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text };
}

/** The endpoint must answer a challenge before a subscription is stored, so URLs cannot be registered for others. */
export async function verifyEndpoint(url: string, secret: string, challenge: string) {
  const r = await post(url, secret, { type: "webhook.verify", challenge });
  if (!r.ok || !r.text.includes(challenge)) throw new Error(`verification failed: the endpoint must reply 2xx with the challenge (got HTTP ${r.status})`);
}

/** Send each active subscription the events after its cursor. Called once a minute. */
export async function deliverWebhooks(sql: postgres.Sql, deadline: number) {
  const hooks = await sql`SELECT * FROM webhooks WHERE disabled_at IS NULL ORDER BY last_delivery NULLS FIRST LIMIT 500`;
  const newest = await latestEventId();
  let sent = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (hooks.length && Date.now() < deadline) {
      const h = hooks.shift()!;
      const events = await feedSince({
        after: String(h.last_event_id), sourceIds: h.source_ids as string[], countries: h.countries as string[],
        subjects: h.subjects as FeedSubject[], limit: BATCH,
      });
      if (!events.length) {
        // Nothing matched: move the cursor up so the next run does not rescan the same events.
        await sql`UPDATE webhooks SET last_event_id = ${newest}::bigint WHERE id = ${h.id} AND last_event_id < ${newest}::bigint`;
        continue;
      }
      try {
        const r = await post(h.url as string, h.secret as string, { type: "changes", subscription: h.id, events });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        await sql`UPDATE webhooks SET last_event_id = ${events[events.length - 1].id}::bigint, failures = 0, last_error = NULL, last_delivery = now() WHERE id = ${h.id}`;
        sent++;
      } catch (e) {
        failed++;
        await sql`
          UPDATE webhooks SET failures = failures + 1, last_error = ${(e as Error).message.slice(0, 300)}, last_delivery = now(),
            disabled_at = CASE WHEN failures + 1 >= ${MAX_FAILURES} THEN now() END
          WHERE id = ${h.id}`;
      }
    }
  }));
  return { sent, failed };
}
