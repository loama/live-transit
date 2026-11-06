import type postgres from "postgres";
import type { IngestResult, SourceMeta } from "@/lib/types";

const CHUNK = 500;

function dedupe<T>(rows: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(key(r), r);
  return [...m.values()];
}

function chunks<T>(rows: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
  return out;
}

const nn = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

/** Finite number or null; tolerates numeric strings and blanks from loose upstream feeds. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

/** Insert or refresh source metadata in batches; rows whose metadata is unchanged are not rewritten. */
export async function upsertSources(sql: postgres.Sql, metas: SourceMeta[]) {
  for (const part of chunks(dedupe(metas, (m) => m.id))) {
    const rows = part.map((m) => ({
      id: m.id, name: m.name, operator: m.operator, country: m.country, city: nn(m.city), region: m.region, modes: m.modes,
      kind: m.kind, homepage: m.homepage, endpoints: m.endpoints, license: nn(m.license), attribution: nn(m.attribution),
      interval_minutes: m.intervalMinutes, lat: num(m.lat), lon: num(m.lon),
    }));
    await sql`
      INSERT INTO sources ${sql(rows as never)}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, operator = EXCLUDED.operator, country = EXCLUDED.country, city = EXCLUDED.city,
        region = EXCLUDED.region, modes = EXCLUDED.modes, kind = EXCLUDED.kind, homepage = EXCLUDED.homepage,
        endpoints = EXCLUDED.endpoints, license = EXCLUDED.license, attribution = EXCLUDED.attribution,
        interval_minutes = EXCLUDED.interval_minutes, lat = EXCLUDED.lat, lon = EXCLUDED.lon, updated_at = now()
      WHERE (sources.name, sources.operator, sources.country, sources.city, sources.region, sources.modes, sources.kind,
             sources.homepage, sources.endpoints, sources.license, sources.attribution, sources.interval_minutes, sources.lat, sources.lon)
        IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.operator, EXCLUDED.country, EXCLUDED.city, EXCLUDED.region, EXCLUDED.modes,
             EXCLUDED.kind, EXCLUDED.homepage, EXCLUDED.endpoints, EXCLUDED.license, EXCLUDED.attribution,
             EXCLUDED.interval_minutes, EXCLUDED.lat, EXCLUDED.lon)`;
  }
}

export function countsOf(r: IngestResult) {
  return {
    alerts: r.alerts?.length ?? 0,
    lines: r.lines?.length ?? 0,
    vehicles: r.vehicles?.length ?? 0,
    departures: r.departures?.length ?? 0,
    stations: r.stations?.length ?? 0,
  };
}

export async function persistResult(sql: postgres.Sql, sourceId: string, result: IngestResult) {
  await sql.begin(async (tx) => {
    if (result.alerts) {
      const alerts = dedupe(result.alerts, (a) => a.id);
      const known = await tx`SELECT id, active FROM alerts WHERE source_id = ${sourceId}`;
      const wasActive = new Set(known.filter((r) => r.active).map((r) => r.id as string));
      for (const part of chunks(alerts)) {
        const rows = part.map((a) => ({
          source_id: sourceId,
          id: a.id,
          severity: a.severity,
          effect: nn(a.effect),
          cause: nn(a.cause),
          title: a.title,
          description: nn(a.description),
          url: nn(a.url),
          modes: a.modes,
          routes: a.routes ?? [],
          stops: a.stops ?? [],
          active_from: nn(a.activeFrom),
          active_until: nn(a.activeUntil),
        }));
        await tx`
          INSERT INTO alerts ${tx(rows as never)}
          ON CONFLICT (source_id, id) DO UPDATE SET
            severity = EXCLUDED.severity, effect = EXCLUDED.effect, cause = EXCLUDED.cause,
            title = EXCLUDED.title, description = EXCLUDED.description, url = EXCLUDED.url,
            modes = EXCLUDED.modes, routes = EXCLUDED.routes, stops = EXCLUDED.stops,
            active_from = EXCLUDED.active_from, active_until = EXCLUDED.active_until,
            active = true, resolved_at = NULL, last_seen_at = now()`;
      }
      const ids = alerts.map((a) => a.id);
      const resolved = await tx`
        UPDATE alerts SET active = false, resolved_at = now()
        WHERE source_id = ${sourceId} AND active AND NOT (id = ANY(${ids}))
        RETURNING id, title, severity`;
      // A source's first ingest only establishes its baseline; its existing alerts are not news.
      const opened = known.length ? alerts.filter((a) => !wasActive.has(a.id)) : [];
      const events = [
        ...opened.map((a) => ({ id: a.id, title: a.title, severity: a.severity, to: "opened", text: a.description ?? null })),
        ...resolved.map((r) => ({ id: r.id as string, title: r.title as string, severity: r.severity as string, to: "resolved", text: null })),
      ];
      for (const part of chunks(events)) {
        await tx`INSERT INTO status_events ${tx(part.map((e) => ({
          source_id: sourceId, subject: "alert", subject_id: e.id, subject_name: e.title.slice(0, 300),
          from_status: null, to_status: e.to, status_text: e.text?.slice(0, 500) ?? null, severity: e.severity,
        })) as never)}`;
      }
    }

    if (result.lines) {
      const lines = dedupe(result.lines, (l) => l.lineId);
      const prev = new Map(
        (await tx`SELECT line_id, status FROM line_status WHERE source_id = ${sourceId}`).map((r) => [
          r.line_id as string,
          r.status as string,
        ]),
      );
      // A line first seen in a quiet state is not a transition worth recording.
      const changed = lines.filter((l) =>
        prev.has(l.lineId) ? prev.get(l.lineId) !== l.status : l.status !== "good" && l.status !== "unknown");
      if (changed.length) {
        await tx`INSERT INTO status_events ${tx(
          changed.map((l) => ({
            source_id: sourceId,
            subject: "line",
            subject_id: l.lineId,
            subject_name: l.lineName,
            from_status: prev.get(l.lineId) ?? null,
            to_status: l.status,
            status_text: l.statusText,
          })) as never,
        )}`;
      }
      for (const part of chunks(lines)) {
        await tx`
          INSERT INTO line_status ${tx(
            part.map((l) => ({
              source_id: sourceId,
              line_id: l.lineId,
              line_name: l.lineName,
              mode: l.mode,
              color: nn(l.color),
              status: l.status,
              status_text: l.statusText,
            })) as never,
          )}
          ON CONFLICT (source_id, line_id) DO UPDATE SET
            line_name = EXCLUDED.line_name, mode = EXCLUDED.mode, color = EXCLUDED.color,
            since = CASE WHEN line_status.status = EXCLUDED.status THEN line_status.since ELSE now() END,
            status = EXCLUDED.status, status_text = EXCLUDED.status_text, updated_at = now()
          WHERE (line_status.line_name, line_status.mode, line_status.color, line_status.status, line_status.status_text)
            IS DISTINCT FROM (EXCLUDED.line_name, EXCLUDED.mode, EXCLUDED.color, EXCLUDED.status, EXCLUDED.status_text)`;
      }
      await tx`DELETE FROM line_status WHERE source_id = ${sourceId} AND NOT (line_id = ANY(${lines.map((l) => l.lineId)}))`;
    }

    if (result.stations) {
      const stations = dedupe(result.stations, (s) => s.stationId);
      const prev = new Map(
        (await tx`SELECT station_id, status FROM stations WHERE source_id = ${sourceId}`).map((r) => [
          r.station_id as string,
          r.status as string,
        ]),
      );
      const changed = stations.filter((s) => prev.has(s.stationId) && prev.get(s.stationId) !== s.status);
      if (changed.length) {
        await tx`INSERT INTO status_events ${tx(
          changed.map((s) => ({
            source_id: sourceId,
            subject: "station",
            subject_id: s.stationId,
            subject_name: s.name,
            from_status: prev.get(s.stationId) ?? null,
            to_status: s.status,
            status_text: nn(s.statusText),
          })) as never,
        )}`;
      }
      for (const part of chunks(stations)) {
        await tx`
          INSERT INTO stations ${tx(
            part.map((s) => ({
              source_id: sourceId,
              station_id: s.stationId,
              name: s.name,
              mode: s.mode,
              city: nn(s.city),
              country: nn(s.country),
              lat: num(s.lat),
              lon: num(s.lon),
              status: s.status,
              status_text: nn(s.statusText),
              delay_minutes: int(s.delayMinutes),
            })) as never,
          )}
          ON CONFLICT (source_id, station_id) DO UPDATE SET
            name = EXCLUDED.name, mode = EXCLUDED.mode, city = COALESCE(EXCLUDED.city, stations.city),
            country = COALESCE(EXCLUDED.country, stations.country), lat = COALESCE(EXCLUDED.lat, stations.lat),
            lon = COALESCE(EXCLUDED.lon, stations.lon),
            since = CASE WHEN stations.status = EXCLUDED.status THEN stations.since ELSE now() END,
            status = EXCLUDED.status, status_text = EXCLUDED.status_text,
            delay_minutes = EXCLUDED.delay_minutes, updated_at = now()`;
      }
    }

    if (result.vehicles) {
      await tx`DELETE FROM vehicles WHERE source_id = ${sourceId}`;
      for (const part of chunks(dedupe(result.vehicles, (v) => v.id))) {
        await tx`INSERT INTO vehicles ${tx(
          part.map((v) => ({
            source_id: sourceId,
            id: v.id,
            mode: v.mode,
            route_id: nn(v.routeId),
            route_name: nn(v.routeName),
            trip_id: nn(v.tripId),
            headsign: nn(v.headsign),
            lat: v.lat,
            lon: v.lon,
            bearing: num(v.bearing),
            speed: num(v.speed),
            label: nn(v.label),
            color: nn(v.color),
            delay_seconds: int(v.delaySeconds),
            observed_at: nn(v.observedAt),
          })) as never,
        )}`;
      }
    }

    if (result.departures) {
      await tx`DELETE FROM departures WHERE source_id = ${sourceId}`;
      for (const part of chunks(dedupe(result.departures, (d) => d.id))) {
        await tx`INSERT INTO departures ${tx(
          part.map((d) => ({
            source_id: sourceId,
            id: d.id,
            station_id: d.stationId,
            station_name: d.stationName,
            direction: d.direction,
            mode: d.mode,
            service: d.service,
            carrier: nn(d.carrier),
            counterpart: nn(d.counterpart),
            scheduled_at: d.scheduledAt,
            estimated_at: nn(d.estimatedAt),
            platform: nn(d.platform),
            status: d.status,
            status_text: nn(d.statusText),
            delay_minutes: int(d.delayMinutes),
          })) as never,
        )}`;
      }
    }
  });
}
