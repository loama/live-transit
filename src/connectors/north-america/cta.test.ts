import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { cta, ctaSeverity, ctaState, isFuture } from "./cta";

describe("cta", () => {
  test("maps statuses", () => {
    expect(ctaState("Normal Service")).toBe("good");
    expect(ctaState("Planned Work")).toBe("minor");
    expect(ctaState("Significant Delays")).toBe("major");
    expect(ctaSeverity({ MajorAlert: "1", Impact: "", SeverityCSS: "" })).toBe("major");
    expect(ctaSeverity({ MajorAlert: "0", Impact: "Elevator Status", SeverityCSS: "special-note" })).toBe("info");
  });

  test("future alerts are not current", () => {
    const now = new Date("2026-11-04T17:00:00Z");
    expect(isFuture({ EventStart: "2026-11-06T22:00:00" }, now)).toBe(true);
    expect(isFuture({ EventStart: "2026-11-04T09:00:00" }, now)).toBe(false);
  });

  test("live", async () => {
    const r = await runConnector(cta);
    expect(r.lines!.find((l) => l.lineId === "Red")?.mode).toBe("metro");
    expect(r.lines!.length).toBeGreaterThan(8);
  }, 30_000);
});
