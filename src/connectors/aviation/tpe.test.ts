import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { mapTpeFlight, tpe } from "./tpe";

describe("taipei", () => {
  test("reads the revised time across midnight in UTC+8", () => {
    const d = mapTpeFlight({ AState: "D", AName: "China Airlines", flightCode: "CI63", Gate: "A6", ODate: "2026/11/04", OTime: "23:35:00", RDate: "2026/11/05", RTime: "00:45:00", CityEname: "Vienna", Memo: "EST. Time Changed", CurrentStatusEng: "" })!;
    expect(d.id).toBe("TPE:departure:CI63:2026-11-04T15:35:00.000Z");
    expect(d.estimatedAt?.toISOString()).toBe("2026-11-04T16:45:00.000Z");
    expect(d.delayMinutes).toBe(70);
    expect(d.status).toBe("delayed");
  });

  test("maps memo and gate status", () => {
    const base = { AState: "D" as const, flightCode: "BR1", ODate: "2026/11/04", OTime: "10:00:00", RDate: "2026/11/04", RTime: "10:00:00" };
    expect(mapTpeFlight({ ...base, Memo: "Cancelled" })!.status).toBe("cancelled");
    expect(mapTpeFlight({ ...base, Memo: " ", CurrentStatusEng: "Final Call" })!.status).toBe("boarding");
    expect(mapTpeFlight({ ...base, AState: "A", Memo: "Arrived", CurrentStatusEng: "To Gate" })!.status).toBe("arrived");
  });

  test("live board", async () => {
    const r = await runConnector(tpe);
    expect(r.departures!.length).toBeGreaterThan(100);
    expect(r.departures!.some((d) => d.direction === "arrival")).toBe(true);
  }, 60_000);
});
