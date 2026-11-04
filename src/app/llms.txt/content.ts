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
- GET /api/v1/routes?sourceId=us-nyc-mta-subway&bbox=-74.1,40.6,-73.8,40.9&geometry=true : static line catalog (names, colors, encoded polyline shapes); needs sourceId or bbox
- GET /api/v1/sources/us-nyc-mta-subway/lines/A : one line with status, live vehicles, shapes, alerts and status history
- GET /api/v1/sources/gtfs-bg-sofia-sofia-traffic/live?routeId=TM33 : vehicle positions read from the operator on request (meta.live true), else the last snapshot
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

- search : find sources, stations, lines and alerts by text (operator names like "TransMilenio", cities, IATA codes). Start here.
- network_status : every line plus alerts for a source_id, city or operator; "is the metro running?"
- line_status : detailed status of one line including live vehicles, alerts and recent transitions
- disruptions : active alerts, most severe first; filter by country (ISO alpha-2), region (europe, latam, ...), city, mode, min_severity
- airport : airport status and departures/arrivals board (starts 30 min ago); board times are airport local time with the zone stated
- find_service : look up a flight or train number on the boards (only about the last 30 min to the next few hours is listed)
- vehicles_near : live vehicles around a lat/lon
- recent_changes : recent line/station status transitions (default last 60 min)
- list_sources : coverage and feed health, filter by country, mode or region

Every MCP answer states "as of <UTC time>, <n> min ago" per source and the operator attribution. An absent place means it is not tracked, not that service is normal. Empty results come back with isError true and a hint on what to try next.

## Tips for agents

- Alert titles from bulk bus feeds can be noisy; narrow by mode (metro, rail) or city.
- Start with /api/v1/search?q=<place> or /api/v1/sources?q=<city> to find the right source id.
- For "is the metro running?" use /api/v1/lines?country=..&disrupted=true plus /api/v1/alerts.
- Use nextCursor from meta to page through alerts.
`;
