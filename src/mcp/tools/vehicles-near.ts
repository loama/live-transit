import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { vehiclesNear } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, asOf, fail, minutesAgo, ok, table } from "../format";

const MODES = ["air", "rail", "metro", "tram", "bus", "ferry", "cable", "other"] as const;

export function registerVehiclesNear(server: McpServer) {
  server.registerTool(
    "vehicles_near",
    {
      title: "Live vehicles near a point",
      description:
        "Live vehicle positions (buses, trams, trains, ferries) nearest first around a coordinate. Only networks that publish vehicle positions are included. Use for 'where is my bus' or 'what is moving around here'.",
      inputSchema: z.object({
        lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
        lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
        radius_km: z.number().min(0.1).max(25).optional().describe("Search radius in km (default 2, max 25)."),
        mode: z.enum(MODES).optional().describe("Only this transport mode."),
        limit: z.number().int().min(1).max(50).optional().describe("Max vehicles (default 20, max 50)."),
      }),
      annotations: READ_ONLY,
    },
    async ({ lat, lon, radius_km, mode, limit }) => {
      const radius = radius_km ?? 2;
      const n = limit ?? 20;
      const all = await vehiclesNear(lat, lon, radius, mode, 5000);
      if (!all.length) {
        return fail(`No live vehicles within ${radius} km of ${lat}, ${lon}${mode ? ` for mode ${mode}` : ""}. Try a larger radius_km (max 25), drop the mode filter, or use list_sources to see which networks publish vehicle positions.`);
      }
      const shown = all.slice(0, n);
      const out = [`${shown.length} of ${all.length} vehicles within ${radius} km of ${lat}, ${lon}, nearest first:`];
      out.push(table(["Km", "Mode", "Route", "Headsign", "Vehicle", "Delay", "Seen", "Source"],
        shown.map((v) => {
          const m = minutesAgo(v.observedAt);
          return [v.distanceKm, v.mode, v.routeName ?? v.routeId, v.headsign, v.label ?? v.id, v.delaySeconds == null ? null : `${Math.round(v.delaySeconds / 60)} min`, m === null ? null : `${m} min ago`, v.sourceId];
        })));
      if (all.length > n) out.push(`${all.length - n} more omitted. Reduce radius_km, set mode, or raise limit (max 50).`);
      const newest = shown.map((v) => v.observedAt).filter(Boolean).sort().pop();
      out.push(`Freshest position ${asOf(newest)}.`, ATTRIBUTION);
      return ok(out.join("\n"), { center: { lat, lon }, radiusKm: radius, total: all.length, vehicles: shown });
    },
  );
}
