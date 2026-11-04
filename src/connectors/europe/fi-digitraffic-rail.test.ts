import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { departuresForStation, fiDigitrafficRail } from "./fi-digitraffic-rail";

describe("fi-digitraffic-rail", () => {
  test("departure mapping", () => {
    const row = (type: "ARRIVAL" | "DEPARTURE", code: string, t: string, extra = {}) => ({
      type, stationShortCode: code, cancelled: false, scheduledTime: t, commercialStop: true, ...extra,
    });
    const d = departuresForStation(
      [{ trainNumber: 1, departureDate: "2026-11-04", trainType: "IC", commuterLineID: "", operatorShortCode: "vr", cancelled: false,
        timeTableRows: [row("DEPARTURE", "HKI", "2026-11-04T10:00:00.000Z", { liveEstimateTime: "2026-11-04T10:07:00.000Z", commercialTrack: "5" }), row("ARRIVAL", "TPE", "2026-11-04T11:30:00.000Z")] }],
      "HKI", new Map([["TPE", "Tampere"]]), "Helsinki",
    );
    expect(d[0]).toMatchObject({ counterpart: "Tampere", platform: "5", status: "delayed", delayMinutes: 7, service: "IC 1" });
  });

  test("live feed", async () => {
    const r = await runConnector(fiDigitrafficRail);
    expect(r.vehicles!.length).toBeGreaterThan(10);
    expect(r.departures!.length).toBeGreaterThan(20);
    expect(r.stations!.length).toBe(4);
  }, 45_000);
});
