import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getBoard, getStation } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, asOf, fail, hhmm, ok, table } from "../format";
import { localHhmm, offsetLabel, timezoneFor } from "../tz";

export function registerAirport(server: McpServer) {
  server.registerTool(
    "airport",
    {
      title: "Airport status and board",
      description:
        "Operational status of an airport (or station) by IATA code, plus its upcoming departures and arrivals with delays, gates and cancellations. Board times are airport local time (zone stated in the output), with UTC where the zone is unknown. Board starts 30 min ago.",
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
        const tz = timezoneFor(st.country, st.lat, st.lon);
        const t = (v: string | null | undefined) => (tz ? localHhmm(v, tz) : hhmm(v));
        const zone = tz ? `${tz} local time, ${offsetLabel(tz)}` : "UTC";
        out.push("", `Recent and upcoming ${direction ?? "departures and arrivals"} (times ${zone}; delay in minutes; sorted by estimated time; starts 30 min ago):`);
        out.push(table(["Time", "Est", "Dir", "Service", "Airline", direction === "arrival" ? "From" : direction === "departure" ? "To" : "To/From", "Gate", "Status", "Delay"],
          shown.map((r) => [t(r.scheduledAt), r.estimatedAt ? t(r.estimatedAt) : null, r.direction === "arrival" ? "arr" : "dep", r.service, r.carrier, r.counterpart, r.platform, r.statusText ?? r.status, r.delayMinutes])));
        if (rows.length > n) out.push(`Showing the first ${n} rows; more exist. Set direction or lower the limit, or use find_service for one flight.`);
      } else {
        out.push("", "No board rows are currently stored for this airport (the source may publish status only).");
      }
      out.push("", ATTRIBUTION);
      return ok(out.join("\n"), { airport: { ...st, reports: undefined }, sources: st.reports, board: shown, boardTruncated: rows.length > n });
    },
  );
}
