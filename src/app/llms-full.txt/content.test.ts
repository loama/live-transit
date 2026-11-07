import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db/client";
import { persistResult, upsertSources } from "@/db/persist";
import { cleanup } from "../../../tests/api/fixtures";
import { generateFullListing } from "./content";

const ID = "test-api-llms-vienna";

beforeAll(async () => {
  const sql = db();
  await upsertSources(sql, [{
    id: ID, name: "Test Vienna Metro", operator: "Test Operator", country: "at", city: "Vienna", region: "europe",
    modes: ["metro"], kind: "api", homepage: "https://example.org", endpoints: ["https://example.org/feed"],
    attribution: "Test attribution", intervalMinutes: 5, lat: 48.2, lon: 16.37,
  }]);
  await persistResult(sql, ID, { lines: [{ lineId: "u1", lineName: "U1", mode: "metro", status: "good", statusText: "Good service" }] });
  await sql`UPDATE sources SET last_success_at = now() WHERE id = ${ID}`;
});
afterAll(cleanup);

describe("llms-full.txt", () => {
  test("lists live networks under their country with modes, data and link", async () => {
    const content = await generateFullListing();
    expect(content).toContain("# Live Transit - Full Network Coverage");
    expect(content).toContain("## Usage");
    expect(content).toContain("### Austria");
    const entry = content.split("\n").find((l) => l.includes("Test Vienna Metro"));
    expect(entry).toBe(`- **Test Vienna Metro**, Vienna (\`${ID}\`): /n/${ID}`);
    expect(content).toMatch(/Modes: metro/);
  });
});
