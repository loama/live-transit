import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getLine, getSource } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, asOf, clip, fail, ok, plural, table } from "../format";

const MAX_VEHICLES = 8;
const MAX_ALERTS = 6;
const MAX_HISTORY = 5;

export function registerLineStatus(server: McpServer) {
  server.registerTool(
    "line_status",
    {
      title: "Line status",
      description:
        "Detailed status of one line including current state, live vehicles reporting on it (with headsigns and delays), active alerts and recent status transitions. Requires source_id and line (route id or line name). Use search or network_status first to find the source_id and line identifier.",
      inputSchema: z.object({
        source_id: z.string().describe("Exact source id, e.g. 'gb-london-tfl'."),
        line: z.string().describe("Route id or line name, e.g. 'central' or 'Central'. Case-insensitive when a name."),
      }),
      annotations: READ_ONLY,
    },
    async ({ source_id, line }) => {
      const source = await getSource(source_id);
      if (!source) return fail(`Unknown source_id "${source_id}". Use search to find valid ids.`);

      let detail = await getLine(source_id, line);
      if (!detail) {
        const lowerLine = line.toLowerCase();
        const candidates = source.lines.filter((l) => l.lineName.toLowerCase() === lowerLine);
        if (candidates.length === 1) detail = await getLine(source_id, candidates[0].lineId);
        else if (candidates.length > 1) {
          const list = candidates.map((c) => `- ${c.lineName} (id: ${c.lineId}, ${c.mode})`).join("\n");
          return fail(`Multiple lines match "${line}" in ${source.name}. Pass the exact id:\n${list}`);
        }
      }
      if (!detail) return fail(`No line "${line}" found in ${source_id}. Use network_status to list all lines for this source.`);

      const now = new Date();
      const out = [
        `## ${detail.name}${detail.longName && detail.longName !== detail.name ? ` (${detail.longName})` : ""} | ${source.name}`,
        `Mode: ${detail.mode}${detail.color ? `, color: #${detail.color}` : ""}`,
      ];

      if (detail.status) {
        const s = detail.status;
        out.push(`Status: ${s.status}${s.statusText && s.statusText !== s.status ? ` (${clip(s.statusText, 120)})` : ""}`);
        out.push(`Since: ${s.since}`);
        out.push(asOf(s.updatedAt, now));
      } else {
        out.push("No live status is published for this line by the source.");
      }

      if (detail.vehicles.length) {
        out.push(`\nVehicles: ${plural(detail.vehicles.length, "vehicle")} currently reporting.`);
        const shown = detail.vehicles.slice(0, MAX_VEHICLES);
        const rows = shown.map((v) => {
          const parts = [v.headsign ?? "-"];
          if (v.delaySeconds != null) {
            const mins = Math.round(v.delaySeconds / 60);
            parts.push(mins === 0 ? "on time" : `${mins > 0 ? "+" : ""}${mins} min`);
          }
          return [v.id, parts.join(", ")];
        });
        out.push(table(["ID", "Headsign / Delay"], rows));
        if (detail.vehicles.length > MAX_VEHICLES) out.push(`(${detail.vehicles.length - MAX_VEHICLES} more vehicles omitted)`);
      } else {
        out.push("\nVehicles: none currently reporting.");
      }

      if (detail.alerts.length) {
        out.push(`\nActive alerts: ${detail.alerts.length}`);
        for (const a of detail.alerts.slice(0, MAX_ALERTS)) {
          out.push(`- [${a.severity}] ${clip(a.title, 140)}${a.description ? `: ${clip(a.description, 140)}` : ""}`);
        }
        if (detail.alerts.length > MAX_ALERTS) out.push(`(${detail.alerts.length - MAX_ALERTS} more alerts omitted)`);
      } else {
        out.push("\nActive alerts: none.");
      }

      if (detail.history.length) {
        out.push(`\nRecent transitions: ${detail.history.length}`);
        for (const h of detail.history.slice(0, MAX_HISTORY)) {
          const from = h.from ?? "unknown";
          const text = h.text && h.text !== h.to ? ` (${clip(h.text, 60)})` : "";
          out.push(`- ${h.at}: ${from} -> ${h.to}${text}`);
        }
      }

      out.push(`\nShapes for mapping: ${detail.shapes.length > 0 ? `${detail.shapes.length} encoded polyline(s)` : "none"}`);
      out.push(`\nSource: ${source.attribution ?? source.operator} (${source.homepage})`);
      out.push(ATTRIBUTION);

      return ok(out.join("\n"), {
        sourceId: source_id,
        lineId: detail.lineId,
        name: detail.name,
        longName: detail.longName,
        mode: detail.mode,
        color: detail.color,
        textColor: detail.textColor,
        status: detail.status,
        vehiclesCount: detail.vehicles.length,
        vehicles: detail.vehicles.slice(0, 100),
        alertsCount: detail.alerts.length,
        alerts: detail.alerts.slice(0, 20),
        historyCount: detail.history.length,
        history: detail.history,
        shapesCount: detail.shapes.length,
      });
    },
  );
}
