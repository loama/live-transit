import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { beloHorizonteBus, parseBh } from "./br-belo-horizonte";

describe("br-belo-horizonte", () => {
  test("parses local timestamps, comma decimals and keeps the latest fix", () => {
    const now = new Date("2026-11-04T16:08:00Z");
    const v = parseBh(
      [
        { EV: "105", HR: "20261104130500", LT: "-19,9", LG: "-43,9", NV: "1", VL: "36", NL: "59" },
        { EV: "105", HR: "20261104130700", LT: "-19,8", LG: "-43,9", NV: "1", VL: "36" },
        { EV: "105", HR: "20261104100000", LT: "-19,7", LG: "-43,9", NV: "2" },
      ],
      now,
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.lat).toBe(-19.8);
    expect(v[0]!.speed).toBe(10);
    expect(v[0]!.observedAt!.toISOString()).toBe("2026-11-04T16:07:00.000Z");
  });

  test("live feed returns thousands of buses", async () => {
    const r = await runConnector(beloHorizonteBus);
    expect(r.vehicles!.length).toBeGreaterThan(1000);
  }, 60_000);
});
