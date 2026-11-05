import { describe, expect, test } from "bun:test";
import { fingerprintOf, packStops, staticFeeds, TILE } from "./static";
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

describe("fingerprintOf", () => {
  test("changes when a key file changes and not otherwise", async () => {
    const { RemoteZip } = await import("@/lib/remote-zip");
    const zip = async (routes: string) => {
      // Minimal stored zip with one routes.txt entry.
      const name = Buffer.from("routes.txt");
      const data = Buffer.from(routes);
      const crc = (await import("node:zlib")).crc32(data);
      const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
      const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt32LE(crc, 16);
      cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28);
      const body = Buffer.concat([local, name, data]);
      const dir = Buffer.concat([cen, name]);
      const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
      end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(body.length, 16);
      return RemoteZip.fromBuffer(Buffer.concat([body, dir, end]));
    };
    const a = fingerprintOf([await zip("route_id\nA\n")]);
    expect(fingerprintOf([await zip("route_id\nA\n")])).toBe(a);
    expect(fingerprintOf([await zip("route_id\nB\n")])).not.toBe(a);
  });
});
