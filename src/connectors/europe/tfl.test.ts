import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { tfl, tflState } from "./tfl";

describe("tfl", () => {
  test("maps severity codes", () => {
    expect(tflState(10)).toBe("good");
    expect(tflState(9)).toBe("minor");
    expect(tflState(6)).toBe("major");
    expect(tflState(20)).toBe("closed");
  });

  test("live feed returns every tube line", async () => {
    const r = await runConnector(tfl);
    expect(r.lines!.length).toBeGreaterThanOrEqual(15);
    expect(r.lines!.find((l) => l.lineId === "victoria")?.lineName).toBe("Victoria");
  }, 30_000);
});
