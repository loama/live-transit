import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { parseTtc, ttc, ttcState } from "./ttc";

describe("ttc", () => {
  test("maps severity", () => {
    expect(ttcState("NO_EFFECT", "Regular")).toBe("good");
    expect(ttcState("REDUCED_SERVICE", "Critical")).toBe("major");
    expect(ttcState("SIGNIFICANT_DELAYS", "Minor")).toBe("minor");
    expect(ttcState("NO_SERVICE", "Major")).toBe("suspended");
  });

  test("ignores alerts that are not current", () => {
    const base = { alertType: "Planned", route: "1", routeType: "Subway", effect: "REDUCED_SERVICE", severity: "Critical", headerText: "h" };
    const r = parseTtc({ routes: [{ ...base, id: "1", activePeriodGroup: ["Upcoming"] }, { ...base, id: "2", activePeriodGroup: ["Current"] }], accessibility: [] });
    expect(r.alerts.map((a) => a.id)).toEqual(["2"]);
    expect(r.lines.find((l) => l.lineId === "1")?.status).toBe("major");
  });

  test("live", async () => {
    const r = await runConnector(ttc);
    expect(r.lines!.map((l) => l.lineId)).toEqual(expect.arrayContaining(["1", "2", "4"]));
    expect(r.vehicles!.length).toBeGreaterThan(300);
  }, 30_000);
});
