import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { auBrisbaneTranslink, seqMode } from "./au-brisbane-translink";

describe("au-brisbane-translink", () => {
  test("infers rail from route ids", () => {
    expect(seqMode("BRSH-5")).toBe("rail");
    expect(seqMode("600-13")).toBe("bus");
    expect(seqMode(undefined)).toBe("bus");
  });

  test("live alerts and vehicles", async () => {
    const r = await runConnector(auBrisbaneTranslink);
    expect(r.alerts!.length).toBeGreaterThan(0);
    expect(r.vehicles!.length).toBeGreaterThan(0);
  }, 45_000);
});
