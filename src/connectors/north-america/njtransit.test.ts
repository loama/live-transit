import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { njTransit, njtRoutes, njtSeverity, parseNjtFeed } from "./njtransit";

const xml = `<rss><channel><item><title>x</title><description>Raritan Valley Line: Buses Replace Trains between Cranford and Newark Penn Station</description><link>https://www.njtransit.com/node/1</link><guid>https://www.njtransit.com/node/1</guid><pubDate>Oct 26, 2026 10:09:54 AM</pubDate></item><item><description>dup</description><guid>https://www.njtransit.com/node/1</guid></item></channel></rss>`;

describe("njtransit", () => {
  test("parses and dedupes rss items", () => {
    const a = parseNjtFeed(xml, "rail");
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe("node/1");
    expect(a[0].routes).toEqual(["Raritan Valley Line"]);
    expect(a[0].severity).toBe("minor");
    expect(a[0].activeFrom!.toISOString()).toBe("2026-10-26T14:09:54.000Z");
  });

  test("route and severity helpers", () => {
    expect(njtRoutes("Bus Detour for Route Nos. 21, 71, 73 & 79 in Orange - Wednesday", "bus").routes).toEqual(["Route 21", "Route 71", "Route 73", "Route 79"]);
    expect(njtRoutes("South Orange Station: Elevator Out of Service", "rail").stops).toEqual(["South Orange Station"]);
    expect(njtSeverity("Westbound Elevator Temporarily Out of Service")).toBe("info");
  });

  test("live", async () => {
    const r = await runConnector(njTransit);
    expect(r.alerts!.length).toBeGreaterThan(0);
    expect(r.alerts!.some((a) => a.modes[0] === "bus")).toBe(true);
  }, 30_000);
});
