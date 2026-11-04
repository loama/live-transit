import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { hkTrafficNews, modesOf, parseReferenceDate } from "./hk-td-traffic-news";

describe("hk-td-traffic-news", () => {
  test("parses the PM marker and Hong Kong zone", () => {
    expect(parseReferenceDate("2026/11/4 下午 11:43:03")?.toISOString()).toBe("2026-11-04T15:43:03.000Z");
    expect(parseReferenceDate("2026/11/4 上午 12:05:00")?.toISOString()).toBe("2026-11-03T16:05:00.000Z");
  });

  test("derives modes from text", () => {
    expect(modesOf("The following ferry services are adjusted")).toEqual(["ferry"]);
    expect(modesOf("Road closed")).toEqual(["other"]);
  });

  test("live feed", async () => {
    const r = await runConnector(hkTrafficNews);
    expect(Array.isArray(r.alerts)).toBe(true);
    for (const a of r.alerts!) expect(a.id).toMatch(/^\d+$/);
  }, 30_000);
});
