import { existsSync, readFileSync } from "node:fs";
import { db } from "@/db/client";
import { persistResult, upsertSources } from "@/db/persist";
import type { SourceMeta } from "@/lib/types";

// bun test sets NODE_ENV=test, which skips .env.local; load it for the database URL.
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
  }
}

export const A = "test-mcp-metro";
export const B = "test-mcp-air";

const base = { country: "zz", region: "europe", kind: "api", homepage: "https://example.test", endpoints: [] as string[], intervalMinutes: 5 } as const;
const metas: SourceMeta[] = [
  { ...base, id: A, name: "Testville Metro", operator: "Testville Transit Authority", city: "Testville", modes: ["metro", "bus"], lat: 10, lon: 20 },
  { ...base, id: B, name: "Testville Airport Board", operator: "Testville Airports", city: "Testville", modes: ["air"], lat: 10.1, lon: 20.1 },
];

const soon = (m: number) => new Date(Date.now() + m * 60_000);

export async function seed() {
  const sql = db();
  await cleanup();
  await upsertSources(sql, metas);
  await persistResult(sql, A, {
    lines: [
      { lineId: "r", lineName: "Zebra Red Line", mode: "metro", status: "good", statusText: "Good service" },
      { lineId: "b", lineName: "Zebra Blue Line", mode: "metro", status: "good", statusText: "Good service" },
    ],
    alerts: [
      { id: "a1", severity: "major", title: "Zebra signal failure at Central", modes: ["metro"], routes: ["Zebra Blue Line"], description: "Trains held." },
      { id: "a2", severity: "info", title: "Zebra lift out of service", modes: ["metro"] },
    ],
    vehicles: [
      { id: "v1", mode: "bus", routeName: "42", lat: 10.001, lon: 20.001, observedAt: new Date() },
      { id: "v2", mode: "bus", routeName: "43", lat: 10.05, lon: 20.05, observedAt: new Date() },
    ],
  });
  // A second run with a worse Blue line creates a status_events transition.
  await persistResult(sql, A, {
    lines: [
      { lineId: "r", lineName: "Zebra Red Line", mode: "metro", status: "good", statusText: "Good service" },
      { lineId: "b", lineName: "Zebra Blue Line", mode: "metro", status: "major", statusText: "Severe delays" },
    ],
    alerts: [{ id: "a1", severity: "major", title: "Zebra signal failure at Central", modes: ["metro"], routes: ["Zebra Blue Line"], description: "Trains held." }],
    vehicles: [
      { id: "v1", mode: "bus", routeName: "42", lat: 10.001, lon: 20.001, observedAt: new Date() },
      { id: "v2", mode: "bus", routeName: "43", lat: 10.05, lon: 20.05, observedAt: new Date() },
    ],
  });
  await persistResult(sql, B, {
    stations: [{ stationId: "ZZT", name: "Testville International", mode: "air", city: "Testville", country: "zz", lat: 10.1, lon: 20.1, status: "delays", statusText: "Fog", delayMinutes: 25 }],
    departures: [
      { id: "d1", stationId: "ZZT", stationName: "Testville International", direction: "departure", mode: "air", service: "ZQ 777", carrier: "Zebra Air", counterpart: "Nowhere", scheduledAt: soon(30), estimatedAt: soon(55), platform: "A4", status: "delayed", delayMinutes: 25 },
      { id: "d2", stationId: "ZZT", stationName: "Testville International", direction: "arrival", mode: "air", service: "ZQ 778", carrier: "Zebra Air", counterpart: "Nowhere", scheduledAt: soon(60), status: "on_time" },
    ],
  });
  await sql`UPDATE sources SET last_success_at = now() - interval '3 minutes', consecutive_failures = 0 WHERE id LIKE 'test-mcp-%'`;
}

export async function cleanup() {
  const sql = db();
  for (const t of ["alerts", "line_status", "stations", "vehicles", "departures", "status_events", "ingest_runs"]) {
    await sql.unsafe(`DELETE FROM ${t} WHERE source_id LIKE 'test-mcp-%'`);
  }
  await sql`DELETE FROM sources WHERE id LIKE 'test-mcp-%'`;
}
