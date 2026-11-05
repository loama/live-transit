CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS sources (
  id                   text PRIMARY KEY,
  name                 text NOT NULL,
  operator             text NOT NULL,
  country              text NOT NULL,
  city                 text,
  region               text NOT NULL,
  modes                text[] NOT NULL,
  kind                 text NOT NULL,
  homepage             text NOT NULL,
  endpoints            text[] NOT NULL DEFAULT '{}',
  license              text,
  attribution          text,
  interval_minutes     int NOT NULL,
  lat                  double precision,
  lon                  double precision,
  enabled              boolean NOT NULL DEFAULT true,
  last_run_at          timestamptz,
  last_success_at      timestamptz,
  last_error           text,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_counts          jsonb NOT NULL DEFAULT '{}',
  last_duration_ms     int,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sources_name_trgm ON sources USING gin ((name || ' ' || operator || ' ' || coalesce(city, '')) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS alerts (
  source_id     text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  id            text NOT NULL,
  severity      text NOT NULL,
  effect        text,
  cause         text,
  title         text NOT NULL,
  description   text,
  url           text,
  modes         text[] NOT NULL,
  routes        text[] NOT NULL DEFAULT '{}',
  stops         text[] NOT NULL DEFAULT '{}',
  active_from   timestamptz,
  active_until  timestamptz,
  active        boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  PRIMARY KEY (source_id, id)
);
CREATE INDEX IF NOT EXISTS alerts_active ON alerts (active, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS alerts_text_trgm ON alerts USING gin ((title || ' ' || coalesce(description, '')) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS line_status (
  source_id   text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  line_id     text NOT NULL,
  line_name   text NOT NULL,
  mode        text NOT NULL,
  color       text,
  status      text NOT NULL,
  status_text text NOT NULL,
  since       timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, line_id)
);

CREATE TABLE IF NOT EXISTS stations (
  source_id   text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  station_id  text NOT NULL,
  name        text NOT NULL,
  mode        text NOT NULL,
  city        text,
  country     text,
  lat         double precision,
  lon         double precision,
  status      text NOT NULL,
  status_text text,
  delay_minutes int,
  since       timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, station_id)
);
CREATE INDEX IF NOT EXISTS stations_station_id ON stations (station_id);

-- Every status transition of a line or station, for history and "what changed" queries.
CREATE TABLE IF NOT EXISTS status_events (
  id          bigserial PRIMARY KEY,
  source_id   text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  subject     text NOT NULL, -- 'line' | 'station'
  subject_id  text NOT NULL,
  subject_name text NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  status_text text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS status_events_at ON status_events (at DESC);
CREATE INDEX IF NOT EXISTS status_events_source ON status_events (source_id, at DESC);

-- Latest snapshot only; replaced on every successful run of the source.
CREATE TABLE IF NOT EXISTS vehicles (
  source_id   text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  id          text NOT NULL,
  mode        text NOT NULL,
  route_id    text,
  route_name  text,
  trip_id     text,
  headsign    text,
  lat         double precision NOT NULL,
  lon         double precision NOT NULL,
  bearing     real,
  speed       real,
  label       text,
  delay_seconds int,
  observed_at timestamptz,
  PRIMARY KEY (source_id, id)
);
CREATE INDEX IF NOT EXISTS vehicles_geo ON vehicles (lat, lon);

-- Latest board snapshot; replaced on every successful run of the source.
CREATE TABLE IF NOT EXISTS departures (
  source_id     text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  id            text NOT NULL,
  station_id    text NOT NULL,
  station_name  text NOT NULL,
  direction     text NOT NULL,
  mode          text NOT NULL,
  service       text NOT NULL,
  carrier       text,
  counterpart   text,
  scheduled_at  timestamptz NOT NULL,
  estimated_at  timestamptz,
  platform      text,
  status        text NOT NULL,
  status_text   text,
  delay_minutes int,
  PRIMARY KEY (source_id, id)
);
CREATE INDEX IF NOT EXISTS departures_station ON departures (station_id, direction, scheduled_at);
CREATE INDEX IF NOT EXISTS departures_service ON departures (upper(service));

CREATE TABLE IF NOT EXISTS ingest_runs (
  id          bigserial PRIMARY KEY,
  source_id   text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL,
  duration_ms int NOT NULL,
  ok          boolean NOT NULL,
  error       text,
  counts      jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ingest_runs_source ON ingest_runs (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ingest_runs_started ON ingest_runs (started_at DESC);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color text;

-- Static GTFS line catalog: every route a source publishes, with simplified geometry for maps.
CREATE TABLE IF NOT EXISTS routes (
  source_id   text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  route_id    text NOT NULL,
  short_name  text,
  long_name   text,
  name        text NOT NULL,
  mode        text NOT NULL,
  color       text,
  text_color  text,
  sort_order  int,
  -- Encoded polylines (precision 5), one per representative shape.
  shapes      text[] NOT NULL DEFAULT '{}',
  min_lat     double precision,
  min_lon     double precision,
  max_lat     double precision,
  max_lon     double precision,
  PRIMARY KEY (source_id, route_id)
);
CREATE INDEX IF NOT EXISTS routes_bbox ON routes (min_lat, max_lat, min_lon, max_lon);

-- One row per source with a static GTFS feed: what was imported, when, and the last error.
CREATE TABLE IF NOT EXISTS static_imports (
  source_id    text PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  urls         text[] NOT NULL,
  attempted_at timestamptz,
  imported_at  timestamptz,
  ok           boolean,
  error        text,
  routes       int,
  shapes       int,
  duration_ms  int
);

-- Stops and stations from static GTFS, packed per source into ~5.5 km tiles (0.05 degrees) to keep millions of
-- stops small: names joined by newlines with parallel coordinate arrays. Platforms are folded into stations.
CREATE TABLE IF NOT EXISTS stop_tiles (
  source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  tx        int NOT NULL,
  ty        int NOT NULL,
  names     text NOT NULL,
  lats      real[] NOT NULL,
  lons      real[] NOT NULL
);
CREATE INDEX IF NOT EXISTS stop_tiles_source ON stop_tiles (source_id);
CREATE INDEX IF NOT EXISTS stop_tiles_xy ON stop_tiles (tx, ty);
-- Must match fold() in src/db/queries/common.ts so searches can use it.
CREATE INDEX IF NOT EXISTS stop_tiles_names_trgm ON stop_tiles
  USING gin ((translate(lower(names), 'áàâäãåéèêëíìîïóòôöõøúùûüýñçšžłß', 'aaaaaaeeeeiiiiooooouuuuyncszls')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS line_status_name_trgm ON line_status USING gin (lower(line_name) gin_trgm_ops);
ALTER TABLE static_imports ADD COLUMN IF NOT EXISTS stops int;

-- Index of route geometry files on blob storage: one immutable JSON file per source per 0.5 degree cell.
CREATE TABLE IF NOT EXISTS geo_tiles (
  source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  tx        int NOT NULL,
  ty        int NOT NULL,
  url       text NOT NULL,
  bytes     int NOT NULL,
  routes    int NOT NULL,
  PRIMARY KEY (source_id, tx, ty)
);
CREATE INDEX IF NOT EXISTS geo_tiles_xy ON geo_tiles (tx, ty);
