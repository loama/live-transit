export const ENDPOINTS = [
  ["GET /api/v1/overview", "Headline counts: sources, countries, alerts, lines, vehicles."],
  ["GET /api/v1/sources", "Every source with health, modes, counts and last update."],
  ["GET /api/v1/alerts", "Active alerts. Filter by country, mode, severity, q. Cursor paginated."],
  ["GET /api/v1/lines", "Line status by source, country or mode."],
  ["GET /api/v1/stations/{id}/board", "Departures and arrivals for an airport or station."],
  ["GET /api/v1/vehicles", "Live positions by bbox, source id or radius around a point."],
  ["GET /api/v1/services/{q}", "Look up a flight or train number, for example LA2365."],
  ["GET /api/v1/search", "Ranked search across networks, stations, lines and alerts."],
  ["GET /api/v1/changes", "Recent status transitions of lines and stations."],
  ["GET /api/v1/health", "Ingestion health per source."],
] as const;

export const CURL_EXAMPLES = [
  ["Worst disruptions right now", 'curl "{origin}/api/v1/alerts?minSeverity=major&limit=5"'],
  ["Heathrow departures", 'curl "{origin}/api/v1/stations/LHR/board?direction=departure"'],
  ["Vehicles in a bounding box (minLon,minLat,maxLon,maxLat)", 'curl "{origin}/api/v1/vehicles?bbox=-0.25,51.45,0.05,51.60"'],
  ["Search", 'curl "{origin}/api/v1/search?q=jubilee"'],
] as const;

export const MCP_TOOLS = [
  ["search", "Find networks, stations, lines and alerts by name."],
  ["network_status", "Line-by-line status and alerts for one network."],
  ["disruptions", "Active disruptions, filtered by country, mode or severity."],
  ["airport", "Status and live board for an airport by IATA code."],
  ["find_service", "Look up a flight or train by its number."],
  ["vehicles_near", "Live vehicles within a radius of a point."],
  ["recent_changes", "What changed status recently."],
  ["list_sources", "Coverage and freshness of every data source."],
] as const;

export const CLAUDE_CODE = "claude mcp add --transport http live-transit {origin}/api/mcp";

export const CLAUDE_DESKTOP = `{
  "mcpServers": {
    "live-transit": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "{origin}/api/mcp"]
    }
  }
}`;

export const CURSOR = `{
  "mcpServers": {
    "live-transit": {
      "url": "{origin}/api/mcp"
    }
  }
}`;
