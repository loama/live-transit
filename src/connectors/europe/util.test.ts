import { describe, expect, test } from "bun:test";
import { hashId, localToDate, stripHtml } from "./util";

describe("util", () => {
  test("localToDate honours DST", () => {
    expect(localToDate("2026-07-01T12:00:00", "Europe/Stockholm").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(localToDate("2026-11-04T16:51:00", "Europe/Stockholm").toISOString()).toBe("2026-11-04T15:51:00.000Z");
    expect(localToDate("2026-11-04T16:51:00", "Europe/Dublin").toISOString()).toBe("2026-11-04T16:51:00.000Z");
    expect(localToDate("2026-03-29T04:00:00", "Europe/Helsinki").toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });
  test("stripHtml", () => {
    expect(stripHtml("<p>A &amp; B</p><p>C</p>")).toBe("A & B\nC");
  });
  test("hashId is stable", () => {
    expect(hashId("x")).toBe(hashId("x"));
  });
});
