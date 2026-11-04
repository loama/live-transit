import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { septa, septaAlerts, septaRouteMode } from "./septa";

const row = (over: object) => ({
  route_id: "rr_route_pao",
  route_name: "Paoli/Thorndale",
  current_message: null,
  advisory_id: null,
  advisory_message: null,
  detour_message: null,
  detour_id: null,
  detour_start_date_time: null,
  detour_end_date_time: null,
  detour_reason: null,
  ...over,
});

describe("septa", () => {
  test("route modes", () => {
    expect(septaRouteMode("rr_route_bsl")).toBe("metro");
    expect(septaRouteMode("trolley_route_10")).toBe("tram");
    expect(septaRouteMode("bus_route_4")).toBe("bus");
  });

  test("service message makes the line minor and ids are stable", () => {
    const now = new Date("2026-11-04T15:00:00Z");
    const a = septaAlerts([row({ current_message: "<p>Train #9518 is canceled.</p>" })], now);
    const b = septaAlerts([row({ current_message: "<p>Train #9518 is canceled.</p>" })], now);
    expect(a.lines[0].status).toBe("minor");
    expect(a.alerts[0].id).toBe(b.alerts[0].id);
    expect(a.alerts[0].title).toBe("Train #9518 is canceled.");
  });

  test("expired detours are dropped", () => {
    const now = new Date("2026-11-04T15:00:00Z");
    const r = septaAlerts(
      [row({ route_id: "bus_route_2", route_name: "2", detour_message: "x", detour_id: "1", detour_start_date_time: "10/01/2026 6:00 AM", detour_end_date_time: "10/02/2026 6:00 AM" })],
      now,
    );
    expect(r.alerts).toHaveLength(0);
  });

  test("live", async () => {
    const r = await runConnector(septa);
    expect(r.lines!.some((l) => l.lineId === "rr_route_bsl")).toBe(true);
    expect(r.vehicles!.length).toBeGreaterThan(50);
  }, 30_000);
});
