import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { amtrak, parseLateness, trainDelayMinutes } from "./amtrak";

describe("amtrak", () => {
  test("parses lateness comments", () => {
    expect(parseLateness("01 HR 18 MI LATE")).toBe(78);
    expect(parseLateness("25 MI LATE")).toBe(25);
    expect(parseLateness("5 MI EARLY")).toBe(-5);
    expect(parseLateness("ON TIME")).toBe(0);
    expect(parseLateness(undefined)).toBeUndefined();
  });

  test("uses the next estimated station for the delay", () => {
    const props = {
      Station1: JSON.stringify({ code: "A", postcmnt: "10 MI LATE" }),
      Station2: JSON.stringify({ code: "B", estarrcmnt: "20 MI LATE" }),
      Station3: JSON.stringify({ code: "C", estarrcmnt: "30 MI LATE" }),
    };
    expect(trainDelayMinutes(props)).toBe(20);
  });

  test("live", async () => {
    const r = await runConnector(amtrak);
    expect(r.vehicles!.length).toBeGreaterThan(40);
    expect(r.vehicles!.some((v) => v.delaySeconds !== undefined)).toBe(true);
  }, 30_000);
});
