import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { mbta } from "./mbta";

describe("mbta", () => {
  test("live", async () => {
    const r = await runConnector(mbta);
    expect(r.lines!.find((l) => l.lineId === "Red")?.lineName).toBe("Red Line");
    expect(r.vehicles!.length).toBeGreaterThan(50);
    expect(r.vehicles!.some((v) => v.mode === "metro")).toBe(true);
  }, 30_000);
});
