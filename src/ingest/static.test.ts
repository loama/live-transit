import { describe, expect, test } from "bun:test";
import { packStops, staticFeeds, TILE } from "./static";
import { scheduleFeeds } from "@/connectors/schedule";

describe("packStops", () => {
  test("groups stops by tile with parallel arrays", () => {
    const tiles = packStops([
      { stopId: "a", name: "One", lat: 10.01, lon: 20.01 },
      { stopId: "b", name: "Two\nLines", lat: 10.02, lon: 20.02 },
      { stopId: "c", name: "Far", lat: 11, lon: 21 },
    ]);
    expect(tiles).toHaveLength(2);
    const near = tiles.find((t) => t.ty === Math.floor(10.01 / TILE))!;
    expect(near.names.split("\n")).toEqual(["One", "Two Lines"]);
    expect(near.lats).toEqual([10.01, 10.02]);
    expect(near.lons).toEqual([20.01, 20.02]);
  });
});

describe("staticFeeds", () => {
  test("every timetable-only source has a compact static feed", () => {
    for (const f of scheduleFeeds.slice(0, 50)) expect(staticFeeds[f.id]).toEqual({ urls: f.static, compact: true });
  });
});
