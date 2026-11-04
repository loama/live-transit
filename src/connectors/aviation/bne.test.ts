import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { bne, mapBneFlight } from "./bne";

describe("brisbane", () => {
  test("maps a delayed departure", () => {
    const d = mapBneFlight({ AirlineCode: "GD", AirlineName: "Alliance", FlightNumber: "861", ToFrom: "Moranbah", DepartureOrArrival: "Departures", PassengerGate: "32", Status: "Delayed", ScheduledTime: "2026-11-04T19:40:00Z", EstimatedTime: "2026-11-04T20:05:00Z" })!;
    expect(d.id).toBe("BNE:departure:GD861:2026-11-04T19:40:00.000Z");
    expect(d.delayMinutes).toBe(25);
    expect(d.status).toBe("delayed");
    expect(d.platform).toBe("32");
  });

  test("live board", async () => {
    const r = await runConnector(bne);
    expect(r.departures!.length).toBeGreaterThan(100);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
  }, 60_000);
});
