import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { search } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, clip, fail, ok, plural } from "../format";

const NEXT: Record<string, string> = {
  source: "network_status(source_id)",
  station: "airport(iata) for airports, otherwise network_status(source_id)",
  line: "network_status(source_id)",
  alert: "disruptions(...) or network_status(source_id)",
};

export function registerSearch(server: McpServer) {
  server.registerTool(
    "search",
    {
      title: "Search transit entities",
      description:
        "Start here. Fuzzy-search cities, operators/networks, airports (name or IATA code like LHR), stations, lines and active alerts. Returns ids to pass to network_status, airport and the other tools.",
      inputSchema: z.object({
        query: z.string().min(2).describe("City, operator, IATA code, station, line or alert keyword, e.g. 'London', 'LHR', 'Luas', 'Northern line'."),
        limit: z.number().int().min(1).max(30).optional().describe("Max hits to return (default 12, max 30)."),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, limit }) => {
      const hits = await search(query, limit ?? 12);
      if (!hits.length) {
        return fail(
          `No matches for "${query}". Try a shorter or alternative spelling, a city name, an operator name, or an IATA code. Call list_sources to see what coverage exists.`,
        );
      }
      const groups = new Map<string, typeof hits>();
      for (const h of hits) groups.set(h.type, [...(groups.get(h.type) ?? []), h]);
      const lines = [`${plural(hits.length, "match", "matches")} for "${query}" (best first):`];
      for (const [type, items] of groups) {
        lines.push("", `${type.toUpperCase()}S (next: ${NEXT[type]})`);
        for (const h of items) {
          const st = h.status ? ` [${h.status}]` : "";
          lines.push(`- ${clip(h.title, 90)}${st} | id: ${h.id} | source_id: ${h.sourceId}${h.subtitle ? ` | ${clip(h.subtitle, 90)}` : ""}`);
        }
      }
      lines.push("", ATTRIBUTION);
      return ok(lines.join("\n"), { query, count: hits.length, hits });
    },
  );
}
