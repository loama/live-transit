import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { mag, mapMagFlight, MAG_AIRPORTS } from "./mag";

const MAN = MAG_AIRPORTS[0];

describe("mag", () => {
  test("maps a departed delayed flight and title-cases names", () => {
    const d = mapMagFlight(MAN, {
      flightNumber: "EZY2011",
      airline: { name: "EASYJET", code: "EZY" },
      status: "Departed",
      scheduledDepartureDateTime: "2026-11-04T12:30:00.000Z",
      estimatedDepartureDateTime: "2026-11-04T14:30:00.000Z",
      actualDepartureDateTime: "2026-11-04T14:31:00.000Z",
      arrivalAirport: { code: "TFS", cityName: "TENERIFE" },
      departureGate: { number: "A3" },
    }, false)!;
    expect(d.id).toBe("MAN:departure:EZY2011:2026-11-04T12:30:00.000Z");
    expect(d.status).toBe("departed");
    expect(d.delayMinutes).toBe(121);
    expect(d.counterpart).toBe("Tenerife");
    expect(d.carrier).toBe("Easyjet");
    expect(d.platform).toBe("A3");
  });

  test("maps an expected arrival", () => {
    const d = mapMagFlight(MAN, { flightNumber: "TOM789", status: "Expected 16:00", scheduledArrivalDateTime: "2026-11-04T15:50:00.000Z", estimatedArrivalDateTime: "2026-11-04T16:00:00.000Z", departureAirport: { code: "HRG", cityName: "HURGHADA" } }, true)!;
    expect(d.status).toBe("on_time");
    expect(d.counterpart).toBe("Hurghada");
  });

  test("live boards for three airports; local clock in status text agrees with the API's UTC times", async () => {
    const r = await runConnector(mag);
    expect(r.stations!.map((s) => s.stationId).sort()).toEqual(["EMA", "MAN", "STN"]);
    expect(r.departures!.filter((d) => d.stationId === "MAN").length).toBeGreaterThan(30);
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    for (const d of r.departures!) {
      const m = d.statusText?.match(/^(?:Departing at|Expected) (\d{2}:\d{2})$/);
      if (m && d.estimatedAt) expect(fmt.format(d.estimatedAt)).toBe(m[1]);
    }
  }, 60_000);
});
