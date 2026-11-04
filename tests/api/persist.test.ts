import { describe, expect, test } from "bun:test";
import { db } from "@/db/client";
import { persistResult } from "@/db/persist";
import "./fixtures";
import type { IngestResult } from "@/lib/types";

const TEST_SRC = "test-api-persist";

async function cleanupTest() {
  const sql = db();
  for (const t of ["line_status", "vehicles", "status_events"]) {
    await sql.unsafe(`DELETE FROM ${t} WHERE source_id = '${TEST_SRC}'`).catch(() => {});
  }
  await sql`DELETE FROM sources WHERE id = ${TEST_SRC}`;
}

describe("persist", () => {
  test("second identical persist of lines does not change updated_at", async () => {
    await cleanupTest();
    const sql = db();
    await sql`INSERT INTO sources (id, name, operator, country, region, modes, kind, homepage, endpoints, interval_minutes) VALUES
      (${TEST_SRC}, 'Test', 'Test Op', 'zz', 'europe', ARRAY['metro'], 'api', 'https://example.org', ARRAY[]::text[], 5)`;

    const result: IngestResult = {
      lines: [{ lineId: "L1", lineName: "Line 1", mode: "metro", status: "good", statusText: "Good service" }],
    };

    await persistResult(sql, TEST_SRC, result);
    const first = await sql`SELECT updated_at FROM line_status WHERE source_id = ${TEST_SRC} AND line_id = 'L1'`;
    const firstTime = first[0].updated_at;

    await new Promise((r) => setTimeout(r, 10));
    await persistResult(sql, TEST_SRC, result);
    const second = await sql`SELECT updated_at FROM line_status WHERE source_id = ${TEST_SRC} AND line_id = 'L1'`;
    const secondTime = second[0].updated_at;

    expect(firstTime.getTime()).toBe(secondTime.getTime());
    await cleanupTest();
  });

  test("first-seen quiet line does not create status_events", async () => {
    await cleanupTest();
    const sql = db();
    await sql`INSERT INTO sources (id, name, operator, country, region, modes, kind, homepage, endpoints, interval_minutes) VALUES
      (${TEST_SRC}, 'Test', 'Test Op', 'zz', 'europe', ARRAY['metro'], 'api', 'https://example.org', ARRAY[]::text[], 5)`;

    const result: IngestResult = {
      lines: [{ lineId: "L2", lineName: "Line 2", mode: "metro", status: "good", statusText: "Good" }],
    };

    await persistResult(sql, TEST_SRC, result);
    const events = await sql`SELECT * FROM status_events WHERE source_id = ${TEST_SRC} AND subject_id = 'L2'`;
    expect(events.length).toBe(0);
    await cleanupTest();
  });

  test("first-seen major line creates status_events", async () => {
    await cleanupTest();
    const sql = db();
    await sql`INSERT INTO sources (id, name, operator, country, region, modes, kind, homepage, endpoints, interval_minutes) VALUES
      (${TEST_SRC}, 'Test', 'Test Op', 'zz', 'europe', ARRAY['metro'], 'api', 'https://example.org', ARRAY[]::text[], 5)`;

    const result: IngestResult = {
      lines: [{ lineId: "L3", lineName: "Line 3", mode: "metro", status: "major", statusText: "Delays" }],
    };

    await persistResult(sql, TEST_SRC, result);
    const events = await sql`SELECT * FROM status_events WHERE source_id = ${TEST_SRC} AND subject_id = 'L3'`;
    expect(events.length).toBe(1);
    expect(events[0].to_status).toBe("major");
    await cleanupTest();
  });

  test("vehicle color persisted", async () => {
    await cleanupTest();
    const sql = db();
    await sql`INSERT INTO sources (id, name, operator, country, region, modes, kind, homepage, endpoints, interval_minutes) VALUES
      (${TEST_SRC}, 'Test', 'Test Op', 'zz', 'europe', ARRAY['bus'], 'api', 'https://example.org', ARRAY[]::text[], 5)`;

    const result: IngestResult = {
      vehicles: [{ id: "V1", mode: "bus", lat: 10, lon: 20, color: "FF0000" }],
    };

    await persistResult(sql, TEST_SRC, result);
    const vehicles = await sql`SELECT color FROM vehicles WHERE source_id = ${TEST_SRC} AND id = 'V1'`;
    expect(vehicles[0].color).toBe("FF0000");
    await cleanupTest();
  });
});
