import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { fra, mapFraFlight } from "./fra";

describe("frankfurt", () => {
  test("maps offsets, estimates and statuses", () => {
    const d = mapFraFlight({ fnr: "4Y 612", alname: "Discover Airlines", apname: "Lyon", sched: "2026-11-04T17:05:00+0100", esti: "2026-11-04T17:45:00+0100", status: "Gate open", gate: "A11" }, false)!;
    expect(d.id).toBe("FRA:departure:4Y612:2026-11-04T16:05:00.000Z");
    expect(d.estimatedAt?.toISOString()).toBe("2026-11-04T16:45:00.000Z");
    expect(d.delayMinutes).toBe(40);
    expect(d.status).toBe("boarding");
    expect(d.platform).toBe("A11");
    const c = mapFraFlight({ fnr: "LH 1", sched: "2026-11-04T17:05:00+0100", status: "Cancelled" }, true)!;
    expect(c.status).toBe("cancelled");
    const t = mapFraFlight({ fnr: "LH 3489", sched: "2026-11-04T17:13:00+0100", ac: "TRS", status: "" }, true)!;
    expect(t.mode).toBe("rail");
    expect(t.status).toBe("scheduled");
  });

  test("live board returns departures and arrivals", async () => {
    const r = await runConnector(fra);
    expect(r.departures!.length).toBeGreaterThan(150);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
    expect(r.stations![0].stationId).toBe("FRA");
  }, 60_000);
});
