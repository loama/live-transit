import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { atWienerLinien, lineMode } from "./at-wiener-linien";

describe("at-wiener-linien", () => {
  test("line modes", () => {
    expect(lineMode("U1")).toBe("metro");
    expect(lineMode("62")).toBe("tram");
    expect(lineMode("13A")).toBe("bus");
    expect(lineMode("N25")).toBe("bus");
  });
  test("live feed", async () => {
    const r = await runConnector(atWienerLinien);
    expect(r.lines!.length).toBe(5);
    expect(r.departures!.length).toBeGreaterThan(50);
    expect(r.alerts!.length).toBeGreaterThan(0);
    const ids = r.alerts!.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  }, 45_000);
});
