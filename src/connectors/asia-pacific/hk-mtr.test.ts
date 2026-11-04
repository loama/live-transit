import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { hkMtr, mtrState } from "./hk-mtr";

describe("hk-mtr", () => {
  test("maps status colours", () => {
    expect(mtrState("green")).toBe("good");
    expect(mtrState("yellow")).toBe("minor");
    expect(mtrState("red")).toBe("major");
    expect(mtrState("purple")).toBe("unknown");
  });

  test("live feed returns every MTR line", async () => {
    const r = await runConnector(hkMtr);
    expect(r.lines!.length).toBeGreaterThanOrEqual(10);
    expect(r.lines!.find((l) => l.lineId === "TWL")?.lineName).toBe("Tsuen Wan Line");
  }, 30_000);
});
