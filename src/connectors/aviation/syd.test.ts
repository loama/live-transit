import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { mapSydFlight, syd } from "./syd";

describe("sydney", () => {
  test("keeps the operating flight and converts AEDT to UTC", () => {
    const d = mapSydFlight({ airline: "Jetstar", flightNumbers: ["JQ221", "QF5538"], destinations: ["Queenstown"], scheduledDate: "2026-11-04", scheduledTime: "06:15", estimatedDate: "2026-11-04", estimatedTime: "06:30", status: "Departed" }, false)!;
    expect(d.id).toBe("SYD:departure:JQ221:2026-11-03T19:15:00.000Z");
    expect(d.estimatedAt?.toISOString()).toBe("2026-11-03T19:30:00.000Z");
    expect(d.delayMinutes).toBe(15);
    expect(d.status).toBe("departed");
  });

  test("no estimate leaves delay undefined", () => {
    const d = mapSydFlight({ flightNumbers: ["QF401"], scheduledDate: "2026-11-05", scheduledTime: "06:00", estimatedTime: "-", status: "On Time" }, false)!;
    expect(d.estimatedAt).toBeUndefined();
    expect(d.status).toBe("scheduled");
  });

  test("live board", async () => {
    const r = await runConnector(syd);
    expect(r.departures!.length).toBeGreaterThan(50);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
  }, 90_000);
});
