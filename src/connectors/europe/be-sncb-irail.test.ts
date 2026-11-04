import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { beSncbIrail, disturbanceSeverity } from "./be-sncb-irail";

describe("be-sncb-irail", () => {
  test("severity", () => {
    expect(disturbanceSeverity({ title: "A - B: No trains", type: "disturbance" })).toBe("severe");
    expect(disturbanceSeverity({ title: "A - B: Fewer trains", type: "disturbance" })).toBe("minor");
    expect(disturbanceSeverity({ title: "Works", type: "planned" })).toBe("info");
  });
  test("live feed", async () => {
    const r = await runConnector(beSncbIrail);
    expect(r.departures!.length).toBeGreaterThan(50);
    expect(r.stations!.length).toBe(6);
    const ids = r.alerts!.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  }, 45_000);
});
