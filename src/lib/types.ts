// Normalized data model shared by every connector, the database, the API and the MCP server.

export type Mode =
  | "air"
  | "rail"
  | "metro"
  | "tram"
  | "bus"
  | "ferry"
  | "cable"
  | "other";

export const MODES: Mode[] = ["air", "rail", "metro", "tram", "bus", "ferry", "cable", "other"];

export type Region = "africa" | "asia" | "europe" | "latam" | "north-america" | "oceania" | "middle-east";

/** "schedule": a published timetable with no live feed; lines and maps only. */
export type SourceKind = "gtfs-rt" | "api" | "scrape" | "fids" | "schedule";

export interface SourceMeta {
  /** Stable slug, e.g. "us-nyc-mta-subway". Format: <iso2>-<city or scope>-<operator>[-<feed>]. */
  id: string;
  /** Human name of the feed, e.g. "MTA New York City Subway". */
  name: string;
  /** Operating agency or company. */
  operator: string;
  /** ISO 3166-1 alpha-2, lowercase. Use "xx" for multi-country feeds. */
  country: string;
  city?: string;
  region: Region;
  modes: Mode[];
  kind: SourceKind;
  /** Official public page of the operator. */
  homepage: string;
  /** Endpoint(s) we read from, shown for transparency. */
  endpoints: string[];
  license?: string;
  attribution?: string;
  /** How often to poll, in minutes. 1 is the floor. */
  intervalMinutes: number;
  /** Approximate center for map display. */
  lat?: number;
  lon?: number;
}

export type Severity = "info" | "minor" | "major" | "severe";

export interface Alert {
  /** Stable id within the source, so the same incident is upserted across runs. */
  id: string;
  severity: Severity;
  /** GTFS-RT style effect when known: NO_SERVICE, REDUCED_SERVICE, SIGNIFICANT_DELAYS, DETOUR, ... */
  effect?: string;
  cause?: string;
  title: string;
  description?: string;
  url?: string;
  modes: Mode[];
  /** Human readable line / route names affected. */
  routes?: string[];
  /** Human readable station / stop names affected. */
  stops?: string[];
  activeFrom?: Date;
  activeUntil?: Date;
}

export type LineState = "good" | "minor" | "major" | "suspended" | "closed" | "unknown";

export interface LineStatus {
  lineId: string;
  lineName: string;
  mode: Mode;
  /** Hex without '#', when the operator publishes one. */
  color?: string;
  status: LineState;
  statusText: string;
}

export interface Vehicle {
  id: string;
  mode: Mode;
  routeId?: string;
  routeName?: string;
  tripId?: string;
  headsign?: string;
  lat: number;
  lon: number;
  bearing?: number;
  /** meters / second */
  speed?: number;
  label?: string;
  /** Route color, hex without '#'. */
  color?: string;
  delaySeconds?: number;
  observedAt?: Date;
}

export type DepartureState =
  | "scheduled"
  | "on_time"
  | "delayed"
  | "boarding"
  | "departed"
  | "arrived"
  | "landed"
  | "cancelled"
  | "diverted"
  | "unknown";

export interface Departure {
  /** Stable within the source, e.g. `${stationId}:${direction}:${flightNumber}:${scheduledIso}`. */
  id: string;
  stationId: string;
  stationName: string;
  direction: "departure" | "arrival";
  mode: Mode;
  /** Flight number, train number or line name. */
  service: string;
  carrier?: string;
  /** Destination for departures, origin for arrivals. */
  counterpart?: string;
  scheduledAt: Date;
  estimatedAt?: Date;
  /** Platform, gate, pier or track. */
  platform?: string;
  status: DepartureState;
  statusText?: string;
  delayMinutes?: number;
}

export type StationState = "normal" | "delays" | "major_delays" | "closed" | "unknown";

export interface StationStatus {
  /** IATA for airports, operator id otherwise. */
  stationId: string;
  name: string;
  mode: Mode;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  status: StationState;
  statusText?: string;
  /** Average delay in minutes when published. */
  delayMinutes?: number;
}

export interface IngestResult {
  alerts?: Alert[];
  lines?: LineStatus[];
  vehicles?: Vehicle[];
  departures?: Departure[];
  stations?: StationStatus[];
}

export interface ConnectorContext {
  /** fetch with a timeout, a polite User-Agent and retry on 5xx. Always use this instead of global fetch. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  now: Date;
}

export interface Connector {
  meta: SourceMeta;
  fetch(ctx: ConnectorContext): Promise<IngestResult>;
  /** Vehicle positions straight from upstream, for on-demand realtime reads. Only cheap single-feed reads implement this. */
  live?(ctx: ConnectorContext): Promise<Vehicle[]>;
}
