export const llmsTxt = `# Live Transit

> Global real-time public transport status from official sources: airport departure/arrival boards, metros, trains, buses and ferries. Free, read-only, no API key.

All paths below are relative to the site origin (the base URL is wherever this file is served from).

## Data model

- Source: one official feed (an operator, airport or city), e.g. "gb-london-tfl". Has country (ISO alpha-2, lowercase), city, region, modes, licence and attribution.
- Line: a route with a status (good, minor, major, suspended, closed, unknown) and a human statusText.
- Alert: an active service notice with severity (info, minor, major, severe), affected modes, routes and stops.
- Station: a station or airport (IATA code for airports) with status (normal, delays, major_delays, closed, unknown) and average delay.
- Board entry: a departure or arrival with flight/train number, scheduled and estimated time, platform/gate and status.
- Vehicle: a live position with route, heading and delay.
- Change: a status transition of a line or station.
- Modes: air, rail, metro, tram, bus, ferry, cable, other.

## Freshness

- Every source has a health: live (recent successful poll), stale (last success older than 3 polling intervals), failing (3 or more consecutive failures), pending (never succeeded).
- Every item carries a timestamp (updatedAt, lastSeenAt, observedAt or scheduledAt). Check it, and the source health, before presenting data as current.
- Data comes from the operator's own feed. When a source is stale or failing, say so rather than asserting the last known state.
- Respect the attribution strings returned in meta.attribution and on sources.

## REST API (JSON)

Every response is { "data": ..., "meta": { "generatedAt", "count", "nextCursor"?, "attribution"? } }. Errors are { "error": { "code", "message" } } with 400, 404 or 500. CORS is open. Responses are cached for about 20 seconds (vehicles 10).

- GET /api/v1/overview : global counts and health
- GET /api/v1/sources?country=gb&mode=metro&region=europe&q=london&health=live : list sources
- GET /api/v1/sources/gb-london-tfl : one source with lines, alerts, stations, recent runs
- GET /api/v1/alerts?country=gb&city=London&mode=metro&minSeverity=major&q=central&since=2026-11-04T00:00:00Z&limit=50&cursor=... : active alerts, paginated
- GET /api/v1/lines?sourceId=gb-london-tfl&disrupted=true : line statuses (also country, mode)
- GET /api/v1/stations?mode=air&country=gb&status=delays&q=heathrow&limit=50 : stations and airports
- GET /api/v1/stations/LHR : one station (IATA codes case-insensitive)
- GET /api/v1/stations/LHR/board?direction=departure&from=2026-11-04T12:00:00Z&limit=30 : departures or arrivals board
- GET /api/v1/services/BA117 : find a flight or train number across all boards
- GET /api/v1/vehicles?bbox=-122.5,37.7,-122.3,37.9&mode=metro : live vehicles in minLon,minLat,maxLon,maxLat
- GET /api/v1/vehicles?lat=37.79&lon=-122.4&radiusKm=2 : nearest vehicles with distanceKm
- GET /api/v1/vehicles?sourceId=us-sf-bart : vehicles of one source
- GET /api/v1/changes?since=2026-11-04T00:00:00Z&sourceId=gb-london-tfl&country=gb&limit=100 : recent status transitions
- GET /api/v1/search?q=heathrow&limit=20 : search sources, stations, lines and alerts
- GET /api/v1/health : per-source freshness and failures
- GET /api/v1/planned : official sources known but not yet ingested
- GET /api/v1/openapi.json : OpenAPI 3.1 specification

## MCP server

Model Context Protocol over Streamable HTTP at /api/mcp. Tools:

- search : find sources, stations, lines and alerts by text
- network_status : status of a city or operator network
- disruptions : active alerts, filterable by place, mode and severity
- airport : airport status and its departures/arrivals board
- find_service : look up a flight or train number
- vehicles_near : live vehicles around a point
- recent_changes : recent status transitions
- list_sources : available sources with health

## Tips for agents

- Start with /api/v1/search?q=<place> or /api/v1/sources?q=<city> to find the right source id.
- For "is the metro running?" use /api/v1/lines?country=..&disrupted=true plus /api/v1/alerts.
- Use nextCursor from meta to page through alerts.
`;
