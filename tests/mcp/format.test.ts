import { describe, expect, test } from "bun:test";
import { asOf, capNote, clip, hhmm, humanDuration, minutesAgo, ok, fail, plural, table, utc } from "@/mcp/format";

const now = new Date("2026-11-04T12:00:00Z");

describe("format helpers", () => {
  test("minutesAgo", () => {
    expect(minutesAgo("2026-11-04T11:55:00Z", now)).toBe(5);
    expect(minutesAgo("2026-11-04T12:05:00Z", now)).toBe(0);
    expect(minutesAgo(null, now)).toBeNull();
    expect(minutesAgo("garbage", now)).toBeNull();
  });
  test("utc and hhmm", () => {
    expect(utc("2026-11-04T12:00:00Z")).toBe("2026-11-04 12:00 UTC");
    expect(utc(null)).toBe("unknown time");
    expect(hhmm("2026-11-04T09:07:00Z")).toBe("09:07");
    expect(hhmm(null)).toBe("-");
  });
  test("humanDuration", () => {
    expect(humanDuration(0)).toBe("under 1 min");
    expect(humanDuration(45)).toBe("45 min");
    expect(humanDuration(180)).toBe("3 h");
    expect(humanDuration(4320)).toBe("3 days");
  });
  test("asOf", () => {
    expect(asOf("2026-11-04T11:57:00Z", now)).toBe("as of 2026-11-04 11:57 UTC, 3 min ago");
    expect(asOf("2026-11-04T12:00:00Z", now)).toContain("just now");
    expect(asOf(null, now)).toBe("no successful update yet");
  });
  test("table sanitizes cells", () => {
    const t = table(["a", "b"], [["x|y", "line1\nline2"], [null, 3]]);
    expect(t.split("\n")).toEqual(["| a | b |", "| --- | --- |", "| x/y | line1 line2 |", "| - | 3 |"]);
  });
  test("clip, capNote, plural", () => {
    expect(clip("a  b\nc", 10)).toBe("a b c");
    expect(clip("abcdefghij", 5)).toBe("abcd...");
    expect(capNote(5, 5, "x")).toBe("");
    expect(capNote(5, 12, "Narrow it.")).toContain("7 omitted. Narrow it.");
    expect(plural(1, "line")).toBe("1 line");
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });
  test("ok and fail", () => {
    expect(ok("t", { a: 1 })).toEqual({ content: [{ type: "text", text: "t" }], structuredContent: { a: 1 } });
    expect(fail("bad").isError).toBe(true);
  });
});
