import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { hkia, mapHkDay, mapHkStatus } from "./hkia";

describe("hkia", () => {
  test("maps statuses and converts HKT to UTC", () => {
    const sched = new Date("2026-11-03T12:45:00Z"); // 20:45 HKT
    const dep = mapHkStatus("Dep 02:01 (04/11/2026)", false, sched);
    expect(dep.status).toBe("departed");
    expect(dep.estimatedAt?.toISOString()).toBe("2026-11-03T18:01:00.000Z");
    expect(mapHkStatus("Cancelled", false, sched).status).toBe("cancelled");
    expect(mapHkStatus("Boarding", false, sched).status).toBe("boarding");
    expect(mapHkStatus("", true, sched).status).toBe("scheduled");
    const est = mapHkStatus("Est at 21:30 (03/11/2026)", true, sched);
    expect(est.status).toBe("delayed");
    expect(est.estimatedAt?.toISOString()).toBe("2026-11-03T13:30:00.000Z");
  });

  test("uses the operating flight and drops codeshares", () => {
    const [d] = mapHkDay(
      { date: "2026-11-04", arrival: false, list: [{ time: "00:15", flight: [{ no: "NH 814", airline: "ANA" }, { no: "UA 7932", airline: "UAL" }], status: "Dep 00:12", destination: ["HND"], gate: "40" }] },
      new Map([["ANA", "All Nippon Airways"]]),
      new Map([["HND", "Tokyo Haneda"]]),
    );
    expect(d.id).toBe("HKG:departure:NH814:2026-11-03T16:15:00.000Z");
    expect(d.carrier).toBe("All Nippon Airways");
    expect(d.counterpart).toBe("Tokyo Haneda");
    expect(d.delayMinutes).toBe(-3);
  });

  test("live board has both directions", async () => {
    const r = await runConnector(hkia);
    expect(r.departures!.length).toBeGreaterThan(100);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
    expect(r.departures!.some((d) => d.direction === "departure")).toBe(true);
    expect(r.stations![0].stationId).toBe("HKG");
  }, 60_000);
});
