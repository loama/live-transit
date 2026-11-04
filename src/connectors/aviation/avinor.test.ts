import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { avinor, mapAvinorFlight, AVINOR_AIRPORTS } from "./avinor";

describe("avinor", () => {
  test("maps a delayed departure and a cancelled arrival", () => {
    const osl = AVINOR_AIRPORTS[0];
    const airlines = new Map([["SK", "SAS"]]);
    const places = new Map([["BGO", "Bergen"]]);
    const d = mapAvinorFlight(osl, { flight_id: "SK123", airline: "SK", schedule_time: "2026-11-04T10:00:00Z", arr_dep: "D", airport: "BGO", gate: "A1", status: { code: "E", time: "2026-11-04T10:25:00Z" } }, airlines, places)!;
    expect(d.id).toBe("OSL:departure:SK123:2026-11-04T10:00:00.000Z");
    expect(d.status).toBe("delayed");
    expect(d.delayMinutes).toBe(25);
    expect(d.carrier).toBe("SAS");
    expect(d.counterpart).toBe("Bergen");
    const c = mapAvinorFlight(osl, { flight_id: "SK124", schedule_time: "2026-11-04T11:00:00Z", arr_dep: "A", airport: "BGO", status: { code: "C" } }, airlines, places)!;
    expect(c.status).toBe("cancelled");
    expect(c.direction).toBe("arrival");
  });

  test("live feed returns boards for several airports", async () => {
    const r = await runConnector(avinor);
    expect(r.stations!.length).toBe(AVINOR_AIRPORTS.length);
    expect(r.departures!.length).toBeGreaterThan(100);
    const osl = r.departures!.filter((d) => d.stationId === "OSL");
    expect(osl.some((d) => d.direction === "departure")).toBe(true);
    expect(osl.some((d) => d.direction === "arrival")).toBe(true);
    expect(r.stations!.find((s) => s.stationId === "OSL")?.status).not.toBe("unknown");
  }, 60_000);
});
