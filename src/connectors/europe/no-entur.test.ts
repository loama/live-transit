import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { enturMode, noEntur } from "./no-entur";

describe("no-entur", () => {
  test("vehicle modes", () => {
    expect(enturMode("VYG:Line:R10")).toBe("rail");
    expect(enturMode("ATB:ServiceJourney:880_26")).toBe("bus");
  });

  test("live feed", async () => {
    const r = await runConnector(noEntur);
    expect(r.vehicles!.length).toBeGreaterThan(500);
    expect(r.alerts!.length).toBeGreaterThan(0);
    expect(r.departures!.length).toBeGreaterThan(20);
    expect(r.stations!.length).toBe(5);
    expect(new Set(r.vehicles!.map((v) => v.id)).size).toBe(r.vehicles!.length);
  }, 45_000);
});
