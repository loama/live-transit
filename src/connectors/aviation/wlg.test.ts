import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { extractFlights, mapWlgFlight, wlg } from "./wlg";

describe("wellington", () => {
  test("extracts embedded JSON and converts NZDT to UTC", () => {
    const html = `<html><script type="application/json" data-flights>{"day":"2026-11-05","flights":[{"place":"Sydney","scheduled":"23:50","estimated":"00:20","carrier_name":"Qantas","flight_number":"QF163","gate":"48","status_text":""}]}</script></html>`;
    const { day, flights } = extractFlights(html);
    const d = mapWlgFlight(flights[0], day, false)!;
    expect(d.id).toBe("WLG:departure:QF163:2026-11-05T10:50:00.000Z");
    expect(d.estimatedAt?.toISOString()).toBe("2026-11-05T11:20:00.000Z");
    expect(d.delayMinutes).toBe(30);
    expect(d.status).toBe("delayed");
  });

  test("rejects a page without flight data", () => {
    expect(() => extractFlights("<html></html>")).toThrow();
  });

  test("live board", async () => {
    const r = await runConnector(wlg);
    expect(r.departures!.length).toBeGreaterThan(30);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
  }, 60_000);
});
