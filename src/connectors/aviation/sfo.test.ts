import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { mapSfoFlight, sfo } from "./sfo";

describe("sfo", () => {
  test("maps a delayed departure with offsets and gate", () => {
    const d = mapSfoFlight({
      flight_kind: "Departure",
      flight_number: "2168",
      airline: { iata_code: "UA", airline_display_name: "United" },
      gate: { gate_number: "E6" },
      scheduled_aod_time: "2026-11-04T05:00:00-08:00",
      estimated_aod_time: "2026-11-04T05:40:00-08:00",
      remark: "Delayed",
      airport: { iata_code: "IAH", airport_city: "Houston/Intercontinental" },
    })!;
    expect(d.id).toBe("SFO:departure:UA2168:2026-11-04T13:00:00.000Z");
    expect(d.delayMinutes).toBe(40);
    expect(d.status).toBe("delayed");
    expect(d.platform).toBe("E6");
  });

  test("live board", async () => {
    const r = await runConnector(sfo);
    expect(r.departures!.length).toBeGreaterThan(100);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
  }, 60_000);
});
