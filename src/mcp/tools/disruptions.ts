import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listAlerts } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, clip, empty, ok, plural, utc } from "../format";

const MODES = ["air", "rail", "metro", "tram", "bus", "ferry", "cable", "other"] as const;

export function registerDisruptions(server: McpServer) {
  server.registerTool(
    "disruptions",
    {
      title: "Active disruptions",
      description:
        "Currently active service alerts worldwide, most severe first. Filter by country, region, city, mode and minimum severity. Use for 'what is broken right now?' questions.",
      inputSchema: z.object({
        country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 country code, e.g. 'gb', 'ie', 'us'."),
        region: z.enum(["africa", "asia", "europe", "latam", "north-america", "oceania", "middle-east"]).optional().describe("World region, e.g. 'europe' for 'major disruptions in Europe'. Use instead of country."),
        city: z.string().optional().describe("City name, e.g. 'London'."),
        mode: z.enum(MODES).optional().describe("Transport mode: air, rail, metro, tram, bus, ferry, cable or other."),
        min_severity: z.enum(["info", "minor", "major", "severe"]).optional().describe("Lowest severity to include (default 'minor')."),
        limit: z.number().int().min(1).max(50).optional().describe("Max alerts to return (default 20, max 50)."),
      }),
      annotations: READ_ONLY,
    },
    async ({ country, region, city, mode, min_severity, limit }) => {
      const n = limit ?? 20;
      const page = await listAlerts({ country, region, city, mode, minSeverity: min_severity ?? "minor", limit: n });
      const filters = [country && `country=${country}`, region && `region=${region}`, city && `city=${city}`, mode && `mode=${mode}`, `min_severity=${min_severity ?? "minor"}`]
        .filter(Boolean)
        .join(", ");
      if (!page.items.length) {
        return empty(`No active alerts match (${filters}). That can mean service is normal or the area is not covered; try a lower min_severity, or use list_sources to check coverage. Line-level status (not only alerts) is available via network_status.`);
      }
      const lines = [`${plural(page.items.length, "active alert")} (${filters}), most severe first:`];
      for (const a of page.items) {
        const where = [a.city, a.country.toUpperCase()].filter(Boolean).join(", ");
        const routes = a.routes.length ? ` Affects: ${a.routes.slice(0, 5).join(", ")}.` : "";
        lines.push(
          `- [${a.severity}] ${clip(a.title, 140)} | ${a.sourceName}, ${where} | modes: ${a.modes.join("/") || "n/a"} | since ${utc(a.firstSeenAt)}.${routes}${a.description ? ` ${clip(a.description, 220)}` : ""}`,
        );
      }
      if (page.nextCursor) lines.push(`Showing the top ${page.items.length}; more exist. Add country, city or mode filters, or raise min_severity.`);
      lines.push("", ATTRIBUTION);
      return ok(lines.filter((l) => l !== "").join("\n"), { filters: { country, region, city, mode, min_severity: min_severity ?? "minor" }, count: page.items.length, hasMore: !!page.nextCursor, alerts: page.items });
    },
  );
}
