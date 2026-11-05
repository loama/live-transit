import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db/client";
import { GET as getRoutes } from "@/app/api/v1/routes/route";
import { GET as getLineDetail } from "@/app/api/v1/sources/[id]/lines/[lineId]/route";
import { GET as getLive } from "@/app/api/v1/sources/[id]/live/route";
import { cleanup, params, req, seed, SRC } from "./fixtures";

beforeAll(async () => {
  await cleanup();
  await seed();
  const sql = db();
  await sql`INSERT INTO routes (source_id, route_id, name, short_name, long_name, mode, color, text_color, shapes, min_lat, min_lon, max_lat, max_lon)
    VALUES (${SRC}, 'zebra', 'Zebra', 'Z', 'Zebra Line', 'metro', 'FF0000', 'FFFFFF', ARRAY['abc'], 10.0, 20.0, 10.1, 20.1)`;
  await sql`UPDATE vehicles SET route_id = 'zebra', color = 'FF0000' WHERE source_id = ${SRC}`;
});
afterAll(cleanup);

describe("/api/v1/routes", () => {
  test("requires sourceId or bbox", async () => {
    const r1 = await getRoutes(req("/api/v1/routes"));
    expect(r1.status).toBe(400);
    const r2 = await getRoutes(req("/api/v1/routes?sourceId=test"));
    expect(r2.status).toBe(200);
  });

  test("returns seeded route by sourceId", async () => {
    const r = await getRoutes(req(`/api/v1/routes?sourceId=${SRC}`));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ routeId: string; name: string; shortName: string | null; longName: string | null; mode: string; color: string | null; bbox: unknown; shapes?: string[] }> };
    expect(data.data.length).toBeGreaterThanOrEqual(1);
    const route = data.data.find((x) => x.routeId === "zebra");
    expect(route?.name).toBe("Zebra");
    expect(route?.shortName).toBe("Z");
    expect(route?.longName).toBe("Zebra Line");
    expect(route?.mode).toBe("metro");
    expect(route?.color).toBe("FF0000");
    expect(route?.bbox).toBeDefined();
    expect(route?.shapes).toBeUndefined();
  });

  test("geometry only when geometry=true", async () => {
    const r1 = await getRoutes(req(`/api/v1/routes?sourceId=${SRC}&geometry=false`));
    const d1 = (await r1.json()) as { data: Array<{ shapes?: string[] }> };
    expect(d1.data[0].shapes).toBeUndefined();
    const r2 = await getRoutes(req(`/api/v1/routes?sourceId=${SRC}&geometry=true`));
    const d2 = (await r2.json()) as { data: Array<{ shapes?: string[] }> };
    expect(d2.data[0].shapes).toBeDefined();
  });

  test("bbox filter", async () => {
    const r = await getRoutes(req("/api/v1/routes?bbox=19.9,9.9,20.2,10.2"));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ routeId: string }> };
    expect(data.data.some((x) => x.routeId === "zebra")).toBe(true);
    const r2 = await getRoutes(req("/api/v1/routes?bbox=50.0,50.0,50.1,50.1"));
    const d2 = (await r2.json()) as { data: Array<{ routeId: string }> };
    expect(d2.data.some((x) => x.routeId === "zebra")).toBe(false);
  });
});

describe("/api/v1/sources/{id}/lines/{lineId}", () => {
  test("returns line detail with status, vehicles, alerts and history", async () => {
    const r = await getLineDetail(req(`/api/v1/sources/${SRC}/lines/zebra`), params({ id: SRC, lineId: "zebra" }));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: { sourceId: string; lineId: string; name: string; longName: string | null; mode: string; color: string | null; status: { status: string }; vehicles: unknown[]; alerts: unknown[]; history: unknown[]; shapes: unknown[] } };
    expect(data.data.sourceId).toBe(SRC);
    expect(data.data.lineId).toBe("zebra");
    expect(data.data.name).toBe("Zebra");
    expect(data.data.longName).toBe("Zebra Line");
    expect(data.data.mode).toBe("metro");
    expect(data.data.color).toBe("FF0000");
    expect(data.data.status).toBeDefined();
    expect(data.data.status.status).toBe("major");
    expect(data.data.vehicles).toHaveLength(1);
    expect(data.data.alerts).toHaveLength(1);
    expect(data.data.history).toBeInstanceOf(Array);
    expect(data.data.shapes).toBeInstanceOf(Array);
  });

  test("404 for unknown line", async () => {
    const r = await getLineDetail(req(`/api/v1/sources/${SRC}/lines/nope`), params({ id: SRC, lineId: "nope" }));
    expect(r.status).toBe(404);
  });
});

describe("/api/v1/sources/{id}/live", () => {
  test("filters to one line with routeId", async () => {
    const r = await getLive(req(`/api/v1/sources/gb-london-tfl/live?routeId=none`), params({ id: "gb-london-tfl" }));
    expect(((await r.json()) as { data: unknown[] }).data).toEqual([]);
  });

  test("404 for unknown source", async () => {
    const r = await getLive(req("/api/v1/sources/nope/live"), params({ id: "nope" }));
    expect(r.status).toBe(404);
  });

  test("200 with meta.live false for source without live() connector", async () => {
    const r = await getLive(req(`/api/v1/sources/gb-london-tfl/live`), params({ id: "gb-london-tfl" }));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: unknown[]; meta: { live: boolean } };
    expect(data.meta.live).toBe(false);
    expect(data.data).toBeInstanceOf(Array);
  });
});

describe("stops", () => {
  test("bbox lookup and search find seeded stops", async () => {
    const sql = db();
    await sql`INSERT INTO stop_tiles (source_id, tx, ty, names, lats, lons) VALUES (${SRC}, 400, 200, ${"Zebra Crossing\nQuokka Plaza"}, ${[10.01, 10.02]}, ${[20.01, 20.02]})`;
    const { GET: stops } = await import("@/app/api/v1/stops/route");
    const r = await stops(req("/api/v1/stops?bbox=20,10,20.015,10.015"));
    expect(((await r.json()) as { data: { name: string }[] }).data.map((s) => s.name)).toEqual(["Zebra Crossing"]);
    expect((await stops(req("/api/v1/stops"))).status).toBe(400);
    const { search } = await import("@/db/queries");
    const hit = (await search("quokka plaza")).find((h) => h.type === "stop");
    expect(hit).toMatchObject({ title: "Quokka Plaza", sourceId: SRC, lat: expect.closeTo(10.02, 4), lon: expect.closeTo(20.02, 4) });
  });
});

describe("timetable-only networks", () => {
  test("lines come from the route catalog with no stored status", async () => {
    const sql = db();
    const id = "test-api-schedule";
    await sql`INSERT INTO sources (id, name, operator, country, region, modes, kind, homepage, endpoints, interval_minutes)
      VALUES (${id}, 'Timetable', 'Op', 'zz', 'europe', ARRAY['bus'], 'schedule', 'https://example.org', ARRAY[]::text[], 1440)`;
    await sql`INSERT INTO routes (source_id, route_id, name, mode) VALUES (${id}, 'r9', 'Quokka Express', 'bus')`;
    const { GET: lines } = await import("@/app/api/v1/lines/route");
    const j = (await (await lines(req(`/api/v1/lines?sourceId=${id}`))).json()) as { data: { lineId: string; status: string; statusText: string }[] };
    expect(j.data).toMatchObject([{ lineId: "r9", status: "unknown", statusText: "Timetable only, no live data" }]);
    expect((await sql`SELECT count(*)::int AS n FROM line_status WHERE source_id = ${id}`)[0].n).toBe(0);
    const { search } = await import("@/db/queries");
    expect((await search("quokka express")).some((h) => h.type === "line" && h.sourceId === id)).toBe(true);
    await sql`DELETE FROM sources WHERE id = ${id}`;
  });
});
