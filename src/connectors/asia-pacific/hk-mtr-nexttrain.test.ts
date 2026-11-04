import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { departuresFor, hkMtrNextTrain, parseStationNames } from "./hk-mtr-nexttrain";

describe("hk-mtr-nexttrain", () => {
  test("parses station csv", () => {
    const names = parseStationNames('"Line Code","Direction","Station Code","Station ID","Chinese Name","English Name","Sequence"\r\n"AEL","DT","AWE","56","博覽館","AsiaWorld-Expo",1.00\r\n');
    expect(names.get("AWE")).toBe("AsiaWorld-Expo");
  });

  test("converts Hong Kong time to UTC and flags delays", () => {
    const res = {
      status: 1,
      isdelay: "Y",
      data: { "TWL-CEN": { UP: [{ seq: "1", dest: "TSW", plat: "1", time: "2026-11-05 00:10:24", ttnt: "10", valid: "Y" }] } },
    };
    const [d] = departuresFor({ line: "TWL", sta: "CEN", lineName: "Tsuen Wan Line" }, res, new Map([["TSW", "Tsuen Wan"]]));
    expect(d.scheduledAt.toISOString()).toBe("2026-11-04T16:10:24.000Z");
    expect(d.counterpart).toBe("Tsuen Wan");
    expect(d.status).toBe("delayed");
  });

  test("live boards", async () => {
    const r = await runConnector(hkMtrNextTrain);
    expect(r.stations!.length).toBeGreaterThanOrEqual(5);
    expect(r.departures!.length).toBeGreaterThan(0);
  }, 45_000);
});
