import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { bart, bartDepartures } from "./bart";

describe("bart", () => {
  test("parses estimates", () => {
    const now = new Date("2026-11-04T16:00:00Z");
    const d = bartDepartures(
      [{ name: "Lake Merritt", abbr: "LAKE", etd: { destination: "Berryessa", abbreviation: "BERY", estimate: [{ minutes: "Leaving", platform: "1", direction: "North", color: "GREEN", delay: "120", cancelflag: "0" }] } }],
      now,
    );
    expect(d).toHaveLength(1);
    expect(d[0].status).toBe("delayed");
    expect(d[0].delayMinutes).toBe(2);
    expect(d[0].estimatedAt!.getTime()).toBe(now.getTime());
  });

  test("live", async () => {
    const r = await runConnector(bart);
    expect(r.departures!.length).toBeGreaterThan(100);
    expect(new Set(r.departures!.map((d) => d.stationId)).size).toBeGreaterThan(30);
  }, 30_000);
});
