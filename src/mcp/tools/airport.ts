import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getBoard, getStation } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, asOf, fail, hhmm, ok, table } from "../format";

export function registerAirport(server: McpServer) {
  server.registerTool(
    "airport",
    {
      title: "Airport status and board",
      description:
        "Operational status of an airport (or station) by IATA code, plus its upcoming departures and arrivals with delays, gates and cancellations. Times are UTC.",
      inputSchema: z.object({
        iata: z.string().min(2).max(8).describe("IATA airport code such as 'LHR', 'DUB' or 'SFO'. Station ids from search also work."),
        direction: z.enum(["departure", "arrival"]).optional().describe("Only departures or only arrivals. Omit for both."),
        limit: z.number().int().min(1).max(50).optional().describe("Max board rows (default 20, max 50)."),
      }),
      annotations: READ_ONLY,
    },
    async ({ iata, direction, limit }) => {
      const st = await getStation(iata);
      if (!st) {
        return fail(`No airport or station with id "${iata.toUpperCase()}" is tracked. Call search with the city or airport name to find the right code; coverage is limited to airports with an official live board.`);
      }
      const n = limit ?? 20;
      const rows = await getBoard({ stationId: iata, direction, limit: n + 1 });
      const shown = rows.slice(0, n);
      const out = [`${st.name} (${st.stationId}, ${st.city ?? "unknown city"}) | status: ${st.status}${st.statusText ? `, ${st.statusText}` : ""}${st.delayMinutes ? `, avg delay ${st.delayMinutes} min` : ""}`];
      for (const r of st.reports) out.push(`Source: ${r.sourceName ?? r.sourceId} (${r.sourceId}), ${asOf(r.updatedAt)}.`);
      if (shown.length) {
        out.push("", `Upcoming ${direction ?? "departures and arrivals"} (UTC; delay in minutes):`);
        out.push(table(["Time", "Est", "Dir", "Service", "Airline", direction === "arrival" ? "From" : direction === "departure" ? "To" : "To/From", "Gate", "Status", "Delay"],
          shown.map((r) => [hhmm(r.scheduledAt), r.estimatedAt ? hhmm(r.estimatedAt) : null, r.direction === "arrival" ? "arr" : "dep", r.service, r.carrier, r.counterpart, r.platform, r.statusText ?? r.status, r.delayMinutes])));
        if (rows.length > n) out.push(`Showing the first ${n} rows; more exist. Set direction or lower the limit, or use find_service for one flight.`);
      } else {
        out.push("", "No board rows are currently stored for this airport (the source may publish status only).");
      }
      out.push("", ATTRIBUTION);
      return ok(out.join("\n"), { airport: { ...st, reports: undefined }, sources: st.reports, board: shown, boardTruncated: rows.length > n });
    },
  );
}
