import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { mtaAlertType, mtaBus, mtaLirr, mtaMetroNorth, mtaSubway, parseSubwayAlerts } from "./mta";

describe("mta", () => {
  test("maps alert types", () => {
    expect(mtaAlertType("Delays").state).toBe("minor");
    expect(mtaAlertType("Planned - Suspended").state).toBe("suspended");
    expect(mtaAlertType("Reduced Service").severity).toBe("major");
    expect(mtaAlertType("Station Notice").state).toBeUndefined();
  });

  test("derives line state from the worst active alert", () => {
    const now = new Date(1_000_000 * 1000);
    const entity = (id: string, route: string, type: string, start: number, end: number) => ({
      id,
      alert: {
        active_period: [{ start, end }],
        informed_entity: [{ route_id: route }],
        header_text: { translation: [{ text: id, language: "en" }] },
        "transit_realtime.mercury_alert": { alert_type: type },
      },
    });
    const r = parseSubwayAlerts(
      [entity("a", "A", "Delays", 0, 2_000_000), entity("b", "A", "Reduced Service", 0, 2_000_000), entity("c", "C", "Delays", 2_000_000, 3_000_000)],
      now,
    );
    expect(r.alerts.map((a) => a.id)).toEqual(["a", "b"]);
    expect(r.lines.find((l) => l.lineId === "A")?.status).toBe("major");
    expect(r.lines.find((l) => l.lineId === "C")?.status).toBe("good");
  });

  test("subway live", async () => {
    const r = await runConnector(mtaSubway);
    expect(r.lines!.length).toBeGreaterThanOrEqual(25);
    expect(r.lines!.find((l) => l.lineId === "L")?.lineName).toBe("L");
  }, 30_000);

  test("bus live", async () => {
    const r = await runConnector(mtaBus);
    expect(r.alerts!.length).toBeGreaterThan(0);
  }, 30_000);

  test("lirr live", async () => {
    const r = await runConnector(mtaLirr);
    expect(r.alerts).toBeDefined();
    const cutoff = Date.now() - 30 * 60_000;
    expect(r.vehicles!.every((v) => v.observedAt!.getTime() >= cutoff)).toBe(true);
  }, 30_000);

  test("metro-north live", async () => {
    const r = await runConnector(mtaMetroNorth);
    expect(r.vehicles!.length).toBeGreaterThan(5);
  }, 30_000);
});
