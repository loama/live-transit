import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { mapTlvRecord, tlv } from "./tlv";

describe("tel aviv", () => {
  test("converts Israel local time (UTC+2 in winter) and maps statuses", () => {
    const d = mapTlvRecord({ CHOPER: "LY", CHFLTN: "281", CHOPERD: "EL AL ISRAEL AIRLINES", CHSTOL: "2026-11-04T13:25:00", CHPTOL: "2026-11-04T18:00:00", CHAORD: "D", CHLOC1: "MXP", CHLOC1D: "MILAN-MALPENSA", CHRMINE: "DELAYED" })!;
    expect(d.id).toBe("TLV:departure:LY281:2026-11-04T11:25:00.000Z");
    expect(d.delayMinutes).toBe(275);
    expect(d.status).toBe("delayed");
    expect(d.counterpart).toBe("Milan-Malpensa");
    const c = mapTlvRecord({ CHOPER: "LY", CHFLTN: "2", CHSTOL: "2026-07-04T13:25:00", CHAORD: "A", CHLOC1: "JFK", CHRMINE: "CANCELED" })!;
    expect(c.status).toBe("cancelled");
    expect(c.scheduledAt.toISOString()).toBe("2026-07-04T10:25:00.000Z");
  });

  test("live board", async () => {
    const r = await runConnector(tlv);
    expect(r.departures!.length).toBeGreaterThan(50);
    expect(r.stations![0].stationId).toBe("TLV");
  }, 60_000);
});
