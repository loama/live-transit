import type { McpServer } from "@modelcontextprotocol/server";
import { registerSearch } from "./tools/search";
import { registerNetworkStatus } from "./tools/network-status";
import { registerLineStatus } from "./tools/line-status";
import { registerDisruptions } from "./tools/disruptions";
import { registerAirport } from "./tools/airport";
import { registerFindService } from "./tools/find-service";
import { registerVehiclesNear } from "./tools/vehicles-near";
import { registerRecentChanges } from "./tools/recent-changes";
import { registerWatchChanges } from "./tools/watch-changes";
import { registerListSources } from "./tools/list-sources";

export const SERVER_INFO = { name: "live-transit", version: "1.0.0" };

export const INSTRUCTIONS = `Live Transit reports real-time public transport status worldwide: airport departure/arrival boards, metro, rail, tram, bus and ferry lines, service alerts and live vehicle positions.

Workflow: start with "search" to turn a city, operator, airport code, line name or topic into ids. Then drill down: "network_status" for a whole network (every line plus active alerts), "line_status" for one line with vehicles and history, "airport" for an airport and its board, "find_service" for a flight or train number, "disruptions" for the worst current problems, "vehicles_near" for live vehicles around a coordinate, "recent_changes" for what just changed, and "list_sources" to see coverage and feed health.

Data comes straight from official operators (airport FIDS, GTFS-Realtime, agency APIs) and is refreshed every 1 to 30 minutes depending on the source. Every answer states "as of <time> UTC, <n> min ago" per source; quote it and warn the user when data is stale or a feed is failing. Coverage is not complete: an absent city or line means it is not tracked, not that service is normal. Times are UTC, except airport boards which use the airport's local time (the zone is stated in the output). For regional questions ("Europe") use disruptions with region; city and operator names match without accents. All tools are read-only and results are capped; narrow filters when told items were omitted.`;

export function registerTools(server: McpServer) {
  registerSearch(server);
  registerNetworkStatus(server);
  registerLineStatus(server);
  registerDisruptions(server);
  registerAirport(server);
  registerFindService(server);
  registerVehiclesNear(server);
  registerRecentChanges(server);
  registerWatchChanges(server);
  registerListSources(server);
}
