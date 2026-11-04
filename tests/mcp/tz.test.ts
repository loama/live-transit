import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { localHhmm, offsetLabel, timezoneFor } from "@/mcp/tz";
import { cleanup, seed } from "./fixtures";
import { callTool } from "./rpc";

describe("timezones", () => {
  test("resolves single and multi-zone countries", () => {
    expect(timezoneFor("gb")).toBe("Europe/London");
    expect(timezoneFor("us", 37.6, -122.4)).toBe("America/Los_Angeles");
    expect(timezoneFor("us", 40.6, -73.8)).toBe("America/New_York");
    expect(timezoneFor("us")).toBeNull();
    expect(timezoneFor("zz", 1, 1)).toBeNull();
  });

  test("formats local time and offset", () => {
    expect(localHhmm("2026-11-04T17:05:00Z", "America/Los_Angeles")).toBe("09:05");
    expect(offsetLabel("Europe/London", new Date("2026-11-04T12:00:00Z"))).toBe("UTC+0");
    expect(offsetLabel("Europe/Paris", new Date("2026-11-04T12:00:00Z"))).toBe("UTC+1");
  });
});

describe("filters", () => {
  beforeAll(seed);
  afterAll(cleanup);

  test("disruptions accepts a region filter", async () => {
    const r = await callTool("disruptions", { region: "europe" });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("region=europe");
    expect((await callTool("disruptions", { region: "oceania", city: "Nowhere" })).data.count).toBe(0);
  });

  test("city filters ignore accents", async () => {
    const r = await callTool("disruptions", { city: "TESTVILLE" });
    expect(r.isError).toBe(false);
    expect((await callTool("network_status", { city: "Téstville" })).isError).toBe(false);
  });
});
