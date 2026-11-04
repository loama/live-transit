import { describe, expect, test } from "bun:test";
import { decodeEntities, localDay, parseLocal, shortHash, zonedDate } from "./util";

describe("util", () => {
  test("parses Hong Kong local time", () => {
    expect(parseLocal("2026-11-05 00:10:24", "Asia/Hong_Kong")?.toISOString()).toBe("2026-11-04T16:10:24.000Z");
  });
  test("handles daylight saving in Sydney", () => {
    expect(zonedDate("Australia/Sydney", 2026, 1, 15, 12).toISOString()).toBe("2026-01-15T01:00:00.000Z");
    expect(zonedDate("Australia/Sydney", 2026, 7, 15, 12).toISOString()).toBe("2026-07-15T02:00:00.000Z");
  });
  test("local day", () => {
    expect(localDay(new Date("2026-11-04T16:00:00Z"), "Asia/Tokyo")).toBe("2026-11-05");
  });
  test("rejects garbage", () => {
    expect(parseLocal("soon", "Asia/Tokyo")).toBeUndefined();
  });
  test("hash is stable", () => {
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
  });
});

test("decodes entities", () => {
  expect(decodeEntities("King&#039;s Road&nbsp;closed &amp; open")).toBe("King's Road closed & open");
});
