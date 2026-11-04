import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { dublinTime, ieIrishRail } from "./ie-irish-rail";

describe("ie-irish-rail", () => {
  test("dublin time parsing and midnight rollover", () => {
    expect(dublinTime("04 Nov 2026", "16:05", "16:04:16")?.toISOString()).toBe("2026-11-04T16:05:00.000Z");
    expect(dublinTime("04 Jul 2026", "16:05", "16:04:16")?.toISOString()).toBe("2026-07-04T15:05:00.000Z");
    expect(dublinTime("04 Nov 2026", "00:10", "23:50:00")?.toISOString()).toBe("2026-11-05T00:10:00.000Z");
  });
  test("live feed", async () => {
    const r = await runConnector(ieIrishRail);
    expect(r.vehicles!.length).toBeGreaterThan(5);
    expect(r.departures!.length).toBeGreaterThan(10);
  }, 45_000);
});
