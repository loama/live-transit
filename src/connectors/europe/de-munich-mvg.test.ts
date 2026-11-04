import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { alertsFromMessages, deMunichMvg } from "./de-munich-mvg";

describe("de-munich-mvg", () => {
  test("incident severity", () => {
    const base = { description: "<p>x</p>", validFrom: 1, lines: [{ label: "S4", transportType: "SBAHN" }] };
    const [a, b] = alertsFromMessages([
      { ...base, title: "Zugausfälle S4", type: "INCIDENT" },
      { ...base, title: "Fahrplanänderung", type: "SCHEDULE_CHANGE" },
    ]);
    expect(a.severity).toBe("major");
    expect(b.severity).toBe("info");
    expect(a.modes).toEqual(["rail"]);
  });
  test("live feed", async () => {
    const r = await runConnector(deMunichMvg);
    expect(r.departures!.length).toBeGreaterThan(50);
    expect(r.alerts!.length).toBeGreaterThan(5);
    const ids = r.alerts!.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  }, 45_000);
});
