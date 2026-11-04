import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listSources } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, asOf, capNote, fail, ok, table } from "../format";

const MODES = ["air", "rail", "metro", "tram", "bus", "ferry", "cable", "other"] as const;
const REGIONS = ["africa", "asia", "europe", "latam", "north-america", "oceania", "middle-east"] as const;
const SHOW = 60;

export function registerListSources(server: McpServer) {
  server.registerTool(
    "list_sources",
    {
      title: "List data sources and coverage",
      description:
        "Which networks, airports and operators are covered, with feed health (live, stale, failing, pending) and last update. Use to check whether a place is tracked or whether data can be trusted.",
      inputSchema: z.object({
        country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 country code, e.g. 'ie'."),
        mode: z.enum(MODES).optional().describe("Only sources that cover this mode."),
        region: z.enum(REGIONS).optional().describe("World region."),
      }),
      annotations: READ_ONLY,
    },
    async ({ country, mode, region }) => {
      const all = await listSources({ country, mode, region });
      if (!all.length) return fail("No sources match those filters. Remove a filter, or check the country code (ISO alpha-2, e.g. 'gb').");
      const shown = all.slice(0, SHOW);
      const h = { live: 0, stale: 0, failing: 0, pending: 0 };
      for (const s of all) h[s.health]++;
      const out = [`${all.length} sources: ${h.live} live, ${h.stale} stale, ${h.failing} failing, ${h.pending} pending.`];
      out.push(table(["source_id", "Name", "Where", "Modes", "Health", "Updated", "Lines off", "Alerts"],
        shown.map((s) => [s.id, s.name, [s.city, s.country.toUpperCase()].filter(Boolean).join(", "), s.modes.join("/"), s.health, asOf(s.lastSuccessAt).replace("as of ", ""), s.disruptedLines, s.activeAlerts])));
      out.push(capNote(shown.length, all.length, "Add country, mode or region filters.").trimEnd(), ATTRIBUTION);
      return ok(out.filter(Boolean).join("\n"), { total: all.length, health: h, sources: shown });
    },
  );
}
