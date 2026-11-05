import { describe, expect, test } from "bun:test";
import { buildTiles, GEO_CELL, publishGeo, type GeoStore } from "./geo";
import { decodePolyline, encodePolyline } from "@/lib/polyline";

const line = encodePolyline([[10.1, 50.1], [10.3, 50.1], [10.6, 50.1], [10.9, 50.1]]);

describe("buildTiles", () => {
  test("cuts a shape into one joined piece per cell it crosses", () => {
    const tiles = buildTiles([{ routeId: "r1", name: "1", mode: "bus", color: "FF0000", shapes: [line] }]);
    expect(tiles.map((t) => [t.tx, t.ty]).sort()).toEqual([[Math.floor(10.1 / GEO_CELL), 100], [Math.floor(10.6 / GEO_CELL), 100]].sort());
    const pieces = tiles.flatMap((t) => t.routes.flatMap((r) => r[4].map(decodePolyline)));
    expect(pieces).toHaveLength(2);
    // Consecutive pieces share their boundary point, so the line is continuous on the map.
    const [a, b] = pieces.sort((x, y) => x[0][0] - y[0][0]);
    expect(b[0]).toEqual(a[a.length - 1]);
    expect(tiles[0].routes[0].slice(0, 4)).toEqual(["r1", "1", "bus", "FF0000"]);
  });

  test("routes without shapes produce no tiles", () => {
    expect(buildTiles([{ routeId: "r", name: "r", mode: "bus", color: null, shapes: [] }])).toEqual([]);
  });
});

describe("publishGeo", () => {
  test("writes tiles, swaps the index and deletes the previous files", async () => {
    const { db } = await import("@/db/client");
    await import("../../tests/api/fixtures");
    const sql = db();
    const id = "test-api-geo";
    await sql`INSERT INTO sources (id, name, operator, country, region, modes, kind, homepage, endpoints, interval_minutes)
      VALUES (${id}, 'Geo', 'Geo', 'zz', 'europe', ARRAY['bus'], 'schedule', 'https://example.org', ARRAY[]::text[], 1440) ON CONFLICT DO NOTHING`;
    const files = new Map<string, string>();
    const deleted: string[] = [];
    let n = 0;
    const store: GeoStore = {
      put: async (path, body) => { const url = `mem://${path}#${n++}`; files.set(url, body); return url; },
      del: async (urls) => { deleted.push(...urls); },
    };
    const routes = [{ routeId: "r1", name: "1", mode: "bus", color: null, shapes: [line] }];
    expect(await publishGeo(sql, id, routes, store)).toBe(2);
    const first = (await sql`SELECT url FROM geo_tiles WHERE source_id = ${id}`).map((r) => r.url as string);
    expect(first).toHaveLength(2);
    expect(JSON.parse(files.get(first[0])!)).toMatchObject({ sourceId: id });
    await publishGeo(sql, id, routes, store);
    expect(deleted.sort()).toEqual(first.sort());
    await sql`DELETE FROM sources WHERE id = ${id}`;
  });
});
