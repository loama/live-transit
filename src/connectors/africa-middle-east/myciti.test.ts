import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { myciti, parsePlannedDisruptions, parseServiceAlerts, parseWindow } from "./myciti";

const PLANNED = (body: string, title = "Marathon") =>
  `<main><section><h2>${title}</h2><div data-control-type="control-simple-text"><p>${body}</p></div></section></main>`;

describe("myciti", () => {
  test("parses day lists and month ranges in SAST", () => {
    const w = parseWindow("17 OCTOBER 2026 ... 18 OCTOBER 2026")!;
    expect(w.from.toISOString()).toBe("2026-10-16T22:00:00.000Z");
    expect(w.until.toISOString()).toBe("2026-10-18T21:59:00.000Z");
    const m = parseWindow("Dates affected: May - August 2026")!;
    expect(m.from.toISOString()).toBe("2026-04-30T22:00:00.000Z");
    expect(m.until.toISOString()).toBe("2026-08-31T21:59:00.000Z");
    expect(parseWindow("no dates")).toBeUndefined();
  });

  test("drops expired planned disruptions and keeps current ones", () => {
    const html = PLANNED("<strong>17 OCTOBER 2026</strong> Routes affected: 101, 102 Time: 12:00");
    expect(parsePlannedDisruptions(html, new Date("2026-11-04T10:00:00Z"))).toHaveLength(0);
    const [a] = parsePlannedDisruptions(html, new Date("2026-10-17T10:00:00Z"));
    expect(a.routes).toEqual(["101", "102"]);
  });

  test("service alerts widget", () => {
    const empty = `<div id="nav-alerts"><div class="alert-text"><p>No alerts available at present</p></div></div>`;
    expect(parseServiceAlerts(empty)).toEqual([]);
    expect(parseServiceAlerts(empty.replace("No alerts available at present", "Route 101 delayed"))).toHaveLength(1);
    expect(() => parseServiceAlerts("<html></html>")).toThrow();
  });

  test("live pages parse", async () => {
    const r = await runConnector(myciti);
    expect(Array.isArray(r.alerts)).toBe(true);
  }, 30_000);
});
