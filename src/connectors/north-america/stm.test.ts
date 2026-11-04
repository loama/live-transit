import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { parseStm, stm, stmState } from "./stm";

const html = (msg: string) => `<ul id="metro-service-status-content"><li><img alt="Line 1 - Green"/><img alt="Line 2 - Orange"/><p class="font-bold">${msg}</p></li></ul>`;

describe("stm", () => {
  test("parses normal service", () => {
    const r = parseStm(html("Normal métro service"));
    expect(r.lines.map((l) => l.status)).toEqual(["good", "good"]);
    expect(r.alerts).toHaveLength(0);
  });

  test("parses an interruption", () => {
    const r = parseStm(html("Service interrupted between Berri-UQAM and Lionel-Groulx"));
    expect(stmState("Service interrupted")).toBe("suspended");
    expect(r.alerts).toHaveLength(1);
    expect(r.lines[0].status).toBe("suspended");
  });

  test("throws when the markup changes", () => {
    expect(() => parseStm("<html></html>")).toThrow();
  });

  test("live", async () => {
    const r = await runConnector(stm);
    expect(r.lines!.map((l) => l.lineId).sort()).toEqual(["1", "2", "4", "5"]);
  }, 30_000);
});
