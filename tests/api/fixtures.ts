import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/db/client";
import { persistResult, upsertSources } from "@/db/persist";
import type { SourceMeta } from "@/lib/types";

// bun test does not load .env.local on its own.
if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(join(import.meta.dir, "../../.env.local"), "utf8");
    const m = env.match(/^DATABASE_URL=["']?([^"'\n]+)/m);
    if (m) process.env.DATABASE_URL = m[1];
  } catch {}
}

export const SRC = "test-api-metro";
export const AIR = "test-api-air";
const now = new Date();
const meta = (id: string, over: Partial<SourceMeta>): SourceMeta => ({
  id, name: `Test ${id}`, operator: "Test Operator", country: "zz", city: "Testville", region: "europe", modes: ["metro"],
  kind: "api", homepage: "https://example.org", endpoints: ["https://example.org/feed"], attribution: "Test attribution",
  intervalMinutes: 5, lat: 10, lon: 20, ...over,
});

export async function seed() {
  const sql = db();
  await upsertSources(sql, [meta(SRC, {}), meta(AIR, { modes: ["air"] })]);
  await persistResult(sql, SRC, {
    alerts: [{ id: "a1", severity: "major", title: "Zebra line delays", modes: ["metro"], routes: ["Zebra"] }],
    lines: [{ lineId: "zebra", lineName: "Zebra", mode: "metro", status: "major", statusText: "Delays" }],
    vehicles: [{ id: "v1", mode: "metro", lat: 10.01, lon: 20.01, routeName: "Zebra", observedAt: now }],
  });
  await persistResult(sql, AIR, {
    stations: [{ stationId: "TZZ", name: "Testville Airport", mode: "air", status: "delays", delayMinutes: 10 }],
    departures: [{
      id: "d1", stationId: "TZZ", stationName: "Testville Airport", direction: "departure", mode: "air", service: "TZ1234",
      scheduledAt: new Date(now.getTime() + 3_600_000), status: "scheduled",
    }],
  });
}

export async function cleanup() {
  const sql = db();
  for (const t of ["alerts", "line_status", "vehicles", "departures", "stations", "status_events", "ingest_runs"])
    await sql.unsafe(`DELETE FROM ${t} WHERE source_id LIKE 'test-api-%'`).catch(() => {});
  await sql`DELETE FROM sources WHERE id LIKE 'test-api-%'`;
}

export const req = (path: string) => new Request(`http://localhost${path}`);
export const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
