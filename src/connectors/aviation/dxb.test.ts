import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { dxb, mapDxbFlight } from "./dxb";

describe("dubai", () => {
  test("treats the Z-suffixed times as Dubai local", () => {
    const d = mapDxbFlight({ flightNumber: "FZ 997", airlineName: "Fly dubai", arrivalDepartureFlag: "D", origin_iata: "DXB", destination_iata: "SVX", destinationName: "Yekaterinburg", flightStatus: "Delayed", gateNumber: "F5", scheduledoffblockTime: "2026-11-05T23:55:00Z", estimatedOffBlockTime: "2026-11-06T00:30:00Z" })!;
    expect(d.id).toBe("DXB:departure:FZ997:2026-11-05T19:55:00.000Z");
    expect(d.delayMinutes).toBe(35);
    expect(d.status).toBe("delayed");
    expect(d.platform).toBe("F5");
  });

  test("routes DWC movements to their own station", () => {
    const d = mapDxbFlight({ flightNumber: "XY 1", arrivalDepartureFlag: "A", origin_iata: "RUH", originName: "Riyadh", destination_iata: "DWC", flightStatus: "Estimated", scheduledOnblockTime: "2026-11-05T10:00:00Z", estimatedOnBlockTime: "2026-11-05T10:00:00Z" })!;
    expect(d.stationId).toBe("DWC");
    expect(d.status).toBe("on_time");
  });

  test("live feed", async () => {
    const r = await runConnector(dxb);
    expect(r.departures!.length).toBeGreaterThan(200);
    expect(r.stations!.map((s) => s.stationId)).toEqual(["DXB", "DWC"]);
    const dep = r.departures!.find((d) => d.status === "departed");
    expect(dep).toBeDefined();
    // a departed flight's actual time must not lie in the future if the local-time reading is right
    expect(dep!.estimatedAt!.getTime()).toBeLessThan(Date.now() + 15 * 60_000);
  }, 60_000);
});
