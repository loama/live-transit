import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { parseWsdotDate, wsf } from "./wsf";

describe("wsf", () => {
  test("parses wsdot dates", () => {
    expect(parseWsdotDate("/Date(1793806759000-0800)/")!.toISOString()).toBe("2026-11-04T15:39:19.000Z");
    expect(parseWsdotDate(undefined)).toBeUndefined();
  });

  test("live", async () => {
    const r = await runConnector(wsf);
    expect(r.vehicles!.length).toBeGreaterThan(5);
    expect(r.lines!.length).toBeGreaterThan(5);
  }, 30_000);
});
