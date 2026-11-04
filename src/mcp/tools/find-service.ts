import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { findService } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, fail, hhmm, ok, table, utc } from "../format";

export function registerFindService(server: McpServer) {
  server.registerTool(
    "find_service",
    {
      title: "Find flight or train by number",
      description:
        "Look up a flight or train number across all tracked boards, e.g. 'LA 2365' or 'BA117'. Returns every matching departure/arrival with status, delay and gate/platform. Spacing and case do not matter.",
      inputSchema: z.object({
        number: z.string().min(2).describe("Flight or train number, e.g. 'BA117', 'LA 2365', 'IC 512'."),
      }),
      annotations: READ_ONLY,
    },
    async ({ number }) => {
      const rows = await findService(number, 30);
      if (!rows.length) {
        return fail(`No board currently lists "${number}". Boards only cover recent and upcoming services at tracked airports and stations. Check the number, or use airport(iata) to browse a board; search can find the airport code.`);
      }
      const out = [`${rows.length} board ${rows.length === 1 ? "entry" : "entries"} for ${number.toUpperCase()} (times UTC):`];
      out.push(table(["Date", "Time", "Est", "Dir", "Where", "Other end", "Gate", "Status", "Delay"],
        rows.map((r) => [utc(r.scheduledAt).slice(0, 10), hhmm(r.scheduledAt), r.estimatedAt ? hhmm(r.estimatedAt) : null, r.direction === "arrival" ? "arr" : "dep", `${r.stationName} (${r.stationId})`, r.counterpart, r.platform, r.statusText ?? r.status, r.delayMinutes])));
      out.push("", `Sources: ${[...new Set(rows.map((r) => r.sourceId))].join(", ")}. ${ATTRIBUTION}`);
      return ok(out.join("\n"), { query: number, count: rows.length, services: rows });
    },
  );
}
