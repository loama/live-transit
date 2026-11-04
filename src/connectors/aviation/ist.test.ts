import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { ist, mapIstFlight } from "./ist";

describe("istanbul", () => {
  test("converts UTC+3 local times and maps remarks", () => {
    const d = mapIstFlight({ flightNumber: "DP0770", airlineName: "Pobeda Airlines", toCityName: "KRASNODAR", scheduledDatetime: "2026-11-04T16:50:00", estimatedDatetime: "2026-11-04T19:00:00", gate: "E4", remark: "Proceed to Gate" }, false)!;
    expect(d.id).toBe("IST:departure:DP0770:2026-11-04T13:50:00.000Z");
    expect(d.estimatedAt?.toISOString()).toBe("2026-11-04T16:00:00.000Z");
    expect(d.delayMinutes).toBe(130);
    expect(d.status).toBe("boarding");
    expect(d.counterpart).toBe("Krasnodar");
    const c = mapIstFlight({ flightNumber: "B99700", fromCityName: "TEHRAN (IKA)", scheduledDatetime: "2026-11-04T19:00:00", estimatedDatetime: "2026-11-04T19:00:00", remark: "Cancelled" }, true)!;
    expect(c.status).toBe("cancelled");
    expect(c.counterpart).toBe("Tehran (IKA)");
  });

  test("live board", async () => {
    const r = await runConnector(ist);
    expect(r.departures!.length).toBeGreaterThan(150);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
  }, 90_000);
});
