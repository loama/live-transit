import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { capMetro, parseCapMetroAlerts } from "./capmetro";

describe("capmetro", () => {
  test("keeps only active, undeleted alerts and never exposes user fields", () => {
    const now = new Date("2026-11-04T16:00:00Z");
    const base = { cause: "MAINTENANCE", effect: "REDUCED_SERVICE", headerText: "h", informedEntities: [{ routeId: "550" }], userEmail: "a@b.c" };
    const r = parseCapMetroAlerts(
      [
        { ...base, id: "1", activePeriods: [{ start: "2026-11-04T00:00:00Z", end: "2026-11-05T00:00:00Z" }] },
        { ...base, id: "2", activePeriods: [{ start: "2026-11-06T00:00:00Z" }] },
        { ...base, id: "3", deletedAt: "2026-11-01T00:00:00Z" },
      ],
      now,
    );
    expect(r.map((a) => a.id)).toEqual(["1"]);
    expect(r[0].modes).toEqual(["rail"]);
    expect(JSON.stringify(r)).not.toContain("a@b.c");
  });

  test("live", async () => {
    const r = await runConnector(capMetro);
    expect(r.vehicles!.length).toBeGreaterThan(50);
  }, 30_000);
});
