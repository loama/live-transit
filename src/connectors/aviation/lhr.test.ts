import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { lhr, mapLhrFlight, type LhrFlight } from "./lhr";

const flight = (status: { message: string; statusCode: string }, sched = "2026-07-04T06:00:00"): LhrFlight => ({
  flightService: {
    iataFlightIdentifier: "TP1363",
    airlineParty: { name: "TAP Portugal" },
    aircraftMovement: {
      aircraftMovementStatus: [status],
      route: {
        portsOfCall: [
          { portOfCallType: "ORIGIN", airportFacility: { iataIdentifier: "LHR", terminalFacility: { gateFacility: { gateNumber: "A18" } } }, operatingTimes: { scheduled: { utc: sched } } },
          { portOfCallType: "DESTINATION", airportFacility: { iataIdentifier: "LIS", airportCityLocation: { name: "Lisbon" } } },
        ],
      },
    },
  },
});

describe("heathrow", () => {
  test("estimated clock time is read as London local time (summer)", () => {
    const d = mapLhrFlight(flight({ message: "Delayed 07:30, check-in Zone D", statusCode: "ES" }), false)!;
    expect(d.id).toBe("LHR:departure:TP1363:2026-07-04T06:00:00.000Z");
    expect(d.estimatedAt?.toISOString()).toBe("2026-07-04T06:30:00.000Z");
    expect(d.delayMinutes).toBe(30);
    expect(d.status).toBe("delayed");
    expect(d.platform).toBe("A18");
    expect(d.counterpart).toBe("Lisbon");
  });

  test("maps departed and cancelled", () => {
    expect(mapLhrFlight(flight({ message: "Departed 06:22", statusCode: "AB" }), false)!.status).toBe("departed");
    expect(mapLhrFlight(flight({ message: "Cancelled, contact airline", statusCode: "CX" }), false)!.status).toBe("cancelled");
  });

  test("live board", async () => {
    const r = await runConnector(lhr);
    expect(r.departures!.length).toBeGreaterThan(150);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
    expect(r.stations![0].stationId).toBe("LHR");
  }, 60_000);
});
