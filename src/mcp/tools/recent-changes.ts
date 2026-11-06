import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { recentChanges } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, clip, humanDuration, minutesAgo, ok, plural, table, utc } from "../format";

const SHOW = 40;

export function registerRecentChanges(server: McpServer) {
  server.registerTool(
    "recent_changes",
    {
      title: "Recent status changes",
      description:
        "Status transitions of lines and stations (for example a line going from good to major delays) and alerts opening or resolving, newest first. Use for 'what just changed?' or to see whether a problem is new. For live updates use watch_changes.",
      inputSchema: z.object({
        since_minutes: z.number().int().min(1).max(10080).optional().describe("Look back this many minutes (default 60, max 10080 = 7 days)."),
        country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 country code, e.g. 'gb'."),
        source_id: z.string().optional().describe("Limit to one network, e.g. 'us-sf-bart'."),
      }),
      annotations: READ_ONLY,
    },
    async ({ since_minutes, country, source_id }) => {
      const mins = since_minutes ?? 60;
      const rows = await recentChanges({ since: new Date(Date.now() - mins * 60_000), country, sourceId: source_id, limit: SHOW + 1 });
      const shown = rows.slice(0, SHOW);
      if (!shown.length) {
        return ok(`No status changes in the last ${humanDuration(mins)}${country ? ` in ${country.toUpperCase()}` : ""}${source_id ? ` for ${source_id}` : ""}. Either everything is steady or the area is not covered; widen since_minutes or check list_sources.`, { sinceMinutes: mins, count: 0, changes: [] });
      }
      const out = [`${plural(shown.length, "status change")} in the last ${humanDuration(mins)}, newest first:`];
      out.push(table(["When (UTC)", "Ago", "Network", "Kind", "Name", "Change", "Detail"],
        shown.map((c) => [utc(c.at).slice(5, 16), `${humanDuration(minutesAgo(c.at) ?? 0)}`, c.sourceName, c.subject, c.subjectName, `${c.fromStatus ?? "new"} -> ${c.toStatus}`, clip(c.statusText, 100)])));
      if (rows.length > SHOW) out.push(`Showing the newest ${SHOW}; more exist. Narrow with country, source_id or a smaller since_minutes.`);
      out.push(ATTRIBUTION);
      return ok(out.join("\n"), { sinceMinutes: mins, count: shown.length, hasMore: rows.length > SHOW, changes: shown });
    },
  );
}
