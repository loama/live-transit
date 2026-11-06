import { z } from "zod";
import { FEED_SUBJECTS, feedSince, latestEventId, type FeedEvent, type FeedSubject } from "@/db/queries";
import { handler, options, parseQuery } from "../_lib";

// Server-Sent Events: every change as it is ingested. One poller per function instance feeds all its connections.
// A connection closes before the function time limit and the client reconnects with Last-Event-ID, so no event is
// lost between connections.

export const maxDuration = 300;

const POLL_MS = 3_000;
const HEARTBEAT_MS = 20_000;
const CONNECTION_MS = 280_000;

type Listener = (events: FeedEvent[]) => void;
const listeners = new Set<Listener>();
let cursor: string | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

async function poll() {
  try {
    cursor ??= await latestEventId();
    const events = await feedSince({ after: cursor, limit: 500 });
    if (!events.length) return;
    cursor = events[events.length - 1].id;
    for (const l of listeners) l(events);
  } catch (e) {
    console.warn("[stream] poll failed:", (e as Error).message);
  }
}

function subscribe(l: Listener) {
  listeners.add(l);
  timer ??= setInterval(poll, POLL_MS);
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
      cursor = undefined;
    }
  };
}

const list = (max: number) => z.string().max(2000).optional().transform((s) => s?.split(",").map((x) => x.trim()).filter(Boolean).slice(0, max) ?? []);
const schema = z.object({
  sourceId: list(50),
  country: list(50),
  subject: list(3).refine((xs) => xs.every((x) => FEED_SUBJECTS.includes(x as FeedSubject)), "must be line, station or alert"),
  after: z.string().regex(/^\d+$/, "must be an event id").optional(),
});

export const GET = handler(async (req) => {
  const f = parseQuery(req, schema);
  const filter = { sourceIds: f.sourceId, countries: f.country.map((c) => c.toLowerCase()), subjects: f.subject as FeedSubject[] };
  const matches = (e: FeedEvent) =>
    (!filter.sourceIds.length || filter.sourceIds.includes(e.sourceId))
    && (!filter.countries.length || filter.countries.includes(e.country))
    && (!filter.subjects.length || filter.subjects.includes(e.subject));
  const after = req.headers.get("last-event-id") ?? f.after;
  const enc = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      let last = after;
      const send = (e: FeedEvent) => {
        c.enqueue(enc.encode(`id: ${e.id}\nevent: change\ndata: ${JSON.stringify(e)}\n\n`));
        last = e.id;
      };
      c.enqueue(enc.encode(`retry: 2000\n: connected\n\n`));
      if (after) for (const e of await feedSince({ ...filter, after, limit: 200 })) send(e);
      const unsubscribe = subscribe((events) => {
        for (const e of events) if (matches(e) && (!last || BigInt(e.id) > BigInt(last))) send(e);
      });
      const beat = setInterval(() => c.enqueue(enc.encode(`: ping\n\n`)), HEARTBEAT_MS);
      const close = () => {
        clearInterval(beat);
        clearTimeout(end);
        unsubscribe();
        try {
          c.close();
        } catch {}
      };
      const end = setTimeout(close, CONNECTION_MS);
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
export const OPTIONS = options;
