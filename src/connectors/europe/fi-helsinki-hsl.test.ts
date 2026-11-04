import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { fiHelsinkiHsl, hslMode } from "./fi-helsinki-hsl";

describe("fi-helsinki-hsl", () => {
  test("route modes", () => {
    expect(hslMode("31M1")).toBe("metro");
    expect(hslMode("3001R")).toBe("rail");
    expect(hslMode("1007")).toBe("tram");
    expect(hslMode("1019")).toBe("ferry");
    expect(hslMode("9788")).toBe("bus");
  });
  test("live feed", async () => {
    const r = await runConnector(fiHelsinkiHsl);
    expect(r.vehicles!.length).toBeGreaterThan(200);
    expect(r.alerts!.length).toBeGreaterThan(0);
  }, 45_000);
});
