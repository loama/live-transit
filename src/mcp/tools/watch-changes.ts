import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { FEED_SUBJECTS, feedSince, type FeedEvent, type FeedSubject } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, clip, ok, plural, table, utc } from "../format";

const MAX_WAIT_S = 25;
const POLL_MS = 2_000;

function render(events: FeedEvent[]) {
  return table(["When (UTC)", "Network", "Kind", "Name", "Change", "Detail"],
    events.map((e) => [utc(e.at).slice(5, 16), e.sourceName, e.subject, e.subjectName, `${e.from ?? "new"} -> ${e.to}`, clip(e.text ?? e.severity ?? "", 90)]));
}

export function registerWatchChanges(server: McpServer) {
  server.registerTool(
    "watch_changes",
    {
      title: "Watch for changes",
      description:
        "Live notifications: returns line, station and alert changes after a cursor, waiting up to wait_seconds for new ones if there are none yet. Call it first without a cursor to get the latest events and a cursor, then call it again with the returned cursor to receive only what happens next. Filter by network, country or kind.",
      inputSchema: z.object({
        cursor: z.string().regex(/^\d+$/).optional().describe("The `cursor` from the previous call. Omit to start from the latest events."),
        source_id: z.string().optional().describe("Only this network, e.g. 'at-vienna-wiener-linien'."),
        country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 country code."),
        kinds: z.array(z.enum(FEED_SUBJECTS as [FeedSubject, ...FeedSubject[]])).optional().describe("Any of line, station, alert."),
        wait_seconds: z.number().int().min(0).max(MAX_WAIT_S).optional().describe(`How long to wait for new events (default ${MAX_WAIT_S}, max ${MAX_WAIT_S}).`),
      }),
      annotations: READ_ONLY,
    },
    async ({ cursor, source_id, country, kinds, wait_seconds }) => {
      const filter = { sourceIds: source_id ? [source_id] : undefined, countries: country ? [country] : undefined, subjects: kinds };
      if (!cursor) {
        const latest = await feedSince({ ...filter, limit: 20 });
        const next = latest.length ? latest[latest.length - 1].id : "0";
        const text = latest.length
          ? `${plural(latest.length, "recent change")}, oldest first:\n${render(latest)}\nCall watch_changes again with cursor "${next}" to wait for new changes.`
          : `No changes recorded yet for this filter. Call watch_changes again with cursor "${next}" to wait for new ones.`;
        return ok(`${text}\n${ATTRIBUTION}`, { cursor: next, events: latest });
      }
      const until = Date.now() + (wait_seconds ?? MAX_WAIT_S) * 1000;
      for (;;) {
        const events = await feedSince({ ...filter, after: cursor, limit: 100 });
        if (events.length || Date.now() >= until) {
          const next = events.length ? events[events.length - 1].id : cursor;
          const text = events.length
            ? `${plural(events.length, "new change")}:\n${render(events)}`
            : `No new changes in the last ${wait_seconds ?? MAX_WAIT_S} seconds.`;
          return ok(`${text}\nNext cursor: "${next}".\n${ATTRIBUTION}`, { cursor: next, events });
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    },
  );
}
