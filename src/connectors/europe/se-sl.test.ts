import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { departuresFromSite, seSl } from "./se-sl";

describe("se-sl", () => {
  test("departure times use Stockholm zone", () => {
    const [d] = departuresFromSite({ id: 1, name: "X" }, [
      { destination: "Y", state: "EXPECTED", scheduled: "2026-11-04T17:00:00", expected: "2026-11-04T17:06:00", journey: { id: 9 }, stop_point: {}, line: { designation: "14", transport_mode: "METRO" } },
    ]);
    expect(d.scheduledAt.toISOString()).toBe("2026-11-04T16:00:00.000Z");
    expect(d.status).toBe("delayed");
    expect(d.mode).toBe("metro");
  });
  test("live feed", async () => {
    const r = await runConnector(seSl);
    expect(r.departures!.length).toBeGreaterThan(50);
    expect(r.alerts!.length).toBeGreaterThan(10);
    expect(r.stations!.length).toBe(5);
  }, 45_000);
});
