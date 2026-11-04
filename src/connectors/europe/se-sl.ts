import { fetchJson } from "@/lib/http";
import type { Alert, Connector, Departure, Mode } from "@/lib/types";
import { delayMinutes, departureState, localToDate, stationFromBoard } from "./util";

const TZ = "Europe/Stockholm";
const DEV = "https://deviations.integration.sl.se/v1/messages";
const TRANSPORT = "https://transport.integration.sl.se/v1";

const SITES = [
  { id: 9001, name: "T-Centralen", lat: 59.3314, lon: 18.0604 },
  { id: 9000, name: "Stockholms central", lat: 59.3311, lon: 18.0577 },
  { id: 9192, name: "Slussen", lat: 59.3203, lon: 18.0725 },
  { id: 9117, name: "Odenplan", lat: 59.3429, lon: 18.0491 },
  { id: 9204, name: "Tekniska högskolan", lat: 59.3455, lon: 18.0717 },
];

const MODE: Record<string, Mode> = { METRO: "metro", BUS: "bus", TRAIN: "rail", TRAM: "tram", SHIP: "ferry" };

interface Deviation {
  deviation_case_id: number;
  publish: { from: string; upto: string };
  message_variants: { header: string; details: string; scope_alias?: string; language: string }[];
  scope: {
    stop_areas?: { name: string }[];
    lines?: { designation: string; transport_mode: string }[];
  };
}
interface Dep {
  destination: string;
  state: string;
  scheduled: string;
  expected: string;
  journey: { id: number };
  stop_point: { designation?: string };
  line: { designation: string; transport_mode: string };
}

export function alertsFromDeviations(list: Deviation[]): Alert[] {
  return list.map((d) => {
    const v = d.message_variants.find((x) => x.language === "en") ?? d.message_variants[0];
    const lines = d.scope.lines ?? [];
    const modes = [...new Set(lines.map((l) => MODE[l.transport_mode] ?? "other"))] as Mode[];
    return {
      id: String(d.deviation_case_id),
      severity: lines.length ? "minor" : "info",
      title: v.header,
      description: v.details.trim() || undefined,
      url: "https://sl.se/en/info/",
      modes: modes.length ? modes : ["other"],
      routes: [...new Set(lines.map((l) => l.designation))].slice(0, 50),
      stops: (d.scope.stop_areas ?? []).map((s) => s.name).slice(0, 50),
      activeFrom: new Date(d.publish.from),
      activeUntil: new Date(d.publish.upto),
    };
  });
}

export function departuresFromSite(site: { id: number; name: string }, deps: Dep[]): Departure[] {
  return deps.map((d) => {
    const scheduledAt = localToDate(d.scheduled, TZ);
    const estimatedAt = localToDate(d.expected, TZ);
    const delay = delayMinutes(scheduledAt, estimatedAt);
    const cancelled = d.state === "CANCELLED";
    return {
      id: `${site.id}:${d.journey.id}:${d.line.designation}`,
      stationId: String(site.id),
      stationName: site.name,
      direction: "departure" as const,
      mode: MODE[d.line.transport_mode] ?? "other",
      service: d.line.designation,
      carrier: "SL",
      counterpart: d.destination,
      scheduledAt,
      estimatedAt,
      platform: d.stop_point.designation || undefined,
      status: d.state === "ATSTOP" && !cancelled ? "boarding" : departureState({ cancelled, delay, realtime: true }),
      delayMinutes: delay,
    };
  });
}

export const seSl: Connector = {
  meta: {
    id: "se-stockholm-sl",
    name: "SL Stockholm",
    operator: "Storstockholms Lokaltrafik (SL)",
    country: "se",
    city: "Stockholm",
    region: "europe",
    modes: ["metro", "rail", "tram", "bus", "ferry"],
    kind: "api",
    homepage: "https://sl.se/en/info/",
    endpoints: [DEV, `${TRANSPORT}/sites/{id}/departures`],
    attribution: "Data from SL via Trafiklab",
    intervalMinutes: 2,
    lat: 59.3293,
    lon: 18.0686,
  },
  async fetch(ctx) {
    // The API rate limits bursts, so the boards are fetched one after another.
    const devs = await fetchJson<Deviation[]>(ctx, DEV);
    const boards: { departures: Dep[] }[] = [];
    for (const s of SITES) {
      boards.push(await fetchJson<{ departures: Dep[] }>(ctx, `${TRANSPORT}/sites/${s.id}/departures?forecast=60`));
    }
    const departures: Departure[] = [];
    const stations = SITES.map((s, i) => {
      const d = departuresFromSite(s, boards[i].departures);
      departures.push(...d);
      return stationFromBoard(
        { stationId: String(s.id), name: s.name, mode: "metro", city: "Stockholm", country: "se", lat: s.lat, lon: s.lon },
        d,
      );
    });
    const now = ctx.now.getTime();
    const alerts = alertsFromDeviations(devs).filter(
      (a) => (a.activeFrom?.getTime() ?? 0) <= now && (a.activeUntil?.getTime() ?? Infinity) >= now,
    );
    return { alerts, departures, stations };
  },
};
