import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { gautrain, gautrainSeverity, parseGautrainTicker } from "./gautrain";

const SAMPLE = `<ul id="ticker02"><li><img alt="red"/> <span>2026-11-04 13:56</span> <span class="tickerTapeMsg">Trains are delayed between Rosebank and Sandton.</span></li></ul>`;

describe("gautrain", () => {
  test("parses ticker items with SAST timestamps", () => {
    const [a] = parseGautrainTicker(SAMPLE);
    expect(a.severity).toBe("minor");
    expect(a.activeFrom!.toISOString()).toBe("2026-11-04T11:56:00.000Z");
    expect(parseGautrainTicker(SAMPLE)[0].id).toBe(a.id);
  });

  test("throws when the ticker is missing", () => {
    expect(() => parseGautrainTicker("<html></html>")).toThrow();
  });

  test("severity keywords", () => {
    expect(gautrainSeverity("Service suspended")).toBe("major");
    expect(gautrainSeverity("Weekend timetable applies")).toBe("info");
  });

  test("live page returns notices", async () => {
    const r = await runConnector(gautrain);
    expect(r.alerts!.length).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
