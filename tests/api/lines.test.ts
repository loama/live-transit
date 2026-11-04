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
