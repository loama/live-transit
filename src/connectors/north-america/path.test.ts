import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { path, pathDepartures } from "./path";

describe("path", () => {
  test("rounds to the minute using the update time", () => {
    const d = pathDepartures({
      results: [
        {
          consideredStation: "NWK",
          destinations: [{ label: "ToNY", messages: [{ target: "WTC", secondsToArrival: "432", arrivalTimeMessage: "7 min", lineColor: "D93A30", headSign: "World Trade Center", lastUpdated: "2026-11-04T10:52:48-05:00" }] }],
        },
      ],
    });
    expect(d[0].estimatedAt!.toISOString()).toBe("2026-11-04T16:00:00.000Z");
    expect(d[0].stationName).toBe("Newark");
  });

  test("live", async () => {
    const r = await runConnector(path);
    expect(r.departures!.length).toBeGreaterThan(10);
  }, 30_000);
});
