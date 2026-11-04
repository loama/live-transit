import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { findService, getStation } from "@/db/queries";
import { localHhmm, offsetLabel, timezoneFor } from "../tz";
import { ATTRIBUTION, READ_ONLY, empty, hhmm, ok, table, utc } from "../format";

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
        return empty(`No board currently lists "${number}". Boards cover only about the last 30 minutes and the next few hours (to roughly 4 h) at tracked airports and stations, so a later or earlier service will not appear. Check the number (use the IATA flight code, e.g. BA117), or call airport(iata) to browse the board and pick a real number; search can find the airport code.`);
      }
      const zones = new Map<string, string | null>();
      for (const id of new Set(rows.map((r) => r.stationId))) {
        const st = await getStation(id);
        zones.set(id, st ? timezoneFor(st.country, st.lat, st.lon) : null);
      }
      const tzs = [...new Set([...zones.values()])];
      const fmt = (r: (typeof rows)[number], v: string | null | undefined) => { const z = zones.get(r.stationId); return z ? localHhmm(v, z) : hhmm(v); };
      const note = tzs.every(Boolean) ? `times local to each airport/station; zones: ${[...zones].map(([k, z]) => `${k} ${z} ${offsetLabel(z!)}`).join(", ")}` : "times UTC unless a zone is shown";
      const out = [`${rows.length} board ${rows.length === 1 ? "entry" : "entries"} for ${number.toUpperCase()} (${note}):`];
      out.push(table(["Date", "Time", "Est", "Dir", "Where", "Other end", "Gate", "Status", "Delay"],
        rows.map((r) => [utc(r.scheduledAt).slice(0, 10), fmt(r, r.scheduledAt), r.estimatedAt ? fmt(r, r.estimatedAt) : null, r.direction === "arrival" ? "arr" : "dep", `${r.stationName} (${r.stationId})`, r.counterpart, r.platform, r.statusText ?? r.status, r.delayMinutes])));
      out.push("", `Sources: ${[...new Set(rows.map((r) => r.sourceId))].join(", ")}. ${ATTRIBUTION}`);
      return ok(out.join("\n"), { query: number, count: rows.length, services: rows });
    },
  );
}
