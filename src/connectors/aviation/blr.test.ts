import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { blr, mapBlrFlight } from "./blr";

describe("bengaluru", () => {
  test("converts IST (UTC+5:30) and maps gate closed", () => {
    const d = mapBlrFlight({ flight_unique_no: "GF281", airline_name: "Gulf Air", flight_status_id: "GATECLOSED", org_airport_id: "BLR", dest_airport_id: "BAH", schedule_hour_id: "2026-11-04 21:50:00", estimated_hour_id: "2026-11-04 21:45:00", gate_id: "C4", bound_id: "D", srcdest_airport_name: "Manama" })!;
    expect(d.id).toBe("BLR:departure:GF281:2026-11-04T16:20:00.000Z");
    expect(d.delayMinutes).toBe(-5);
    expect(d.status).toBe("boarding");
    expect(d.counterpart).toBe("Manama");
  });

  test("live board", async () => {
    const r = await runConnector(blr);
    expect(r.departures!.length).toBeGreaterThan(20);
    expect(r.stations![0].stationId).toBe("BLR");
  }, 60_000);
});
