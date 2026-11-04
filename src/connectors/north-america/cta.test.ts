import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { cta, ctaSeverity, ctaState } from "./cta";

describe("cta", () => {
  test("maps statuses", () => {
    expect(ctaState("Normal Service")).toBe("good");
    expect(ctaState("Planned Work")).toBe("minor");
    expect(ctaState("Significant Delays")).toBe("major");
    expect(ctaSeverity({ MajorAlert: "1", Impact: "", SeverityCSS: "" })).toBe("major");
    expect(ctaSeverity({ MajorAlert: "0", Impact: "Elevator Status", SeverityCSS: "special-note" })).toBe("info");
  });

  test("live", async () => {
    const r = await runConnector(cta);
    expect(r.lines!.find((l) => l.lineId === "Red")?.mode).toBe("metro");
    expect(r.lines!.length).toBeGreaterThan(8);
  }, 30_000);
});
