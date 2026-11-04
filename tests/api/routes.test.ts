import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GET as overview } from "@/app/api/v1/overview/route";
import { GET as sources } from "@/app/api/v1/sources/route";
import { GET as source } from "@/app/api/v1/sources/[id]/route";
import { GET as alerts } from "@/app/api/v1/alerts/route";
import { GET as lines } from "@/app/api/v1/lines/route";
import { GET as stations } from "@/app/api/v1/stations/route";
import { GET as station } from "@/app/api/v1/stations/[id]/route";
import { GET as board } from "@/app/api/v1/stations/[id]/board/route";
import { GET as service } from "@/app/api/v1/services/[q]/route";
import { GET as vehicles } from "@/app/api/v1/vehicles/route";
import { GET as changes } from "@/app/api/v1/changes/route";
import { GET as search } from "@/app/api/v1/search/route";
import { GET as health } from "@/app/api/v1/health/route";
import { GET as planned } from "@/app/api/v1/planned/route";
import { cleanup, params, req, seed, SRC } from "./fixtures";

beforeAll(async () => {
  await cleanup();
  await seed();
});
afterAll(cleanup);

const body = async (r: Response) => (await r.json()) as { data: any; meta: any; error?: any };

describe("envelope", () => {
  test("list endpoints return data and meta", async () => {
    for (const [h, url] of [
      [sources, "/api/v1/sources?country=zz"], [alerts, "/api/v1/alerts?country=zz"], [lines, "/api/v1/lines?sourceId=" + SRC],
      [stations, "/api/v1/stations?q=testville"], [changes, "/api/v1/changes"], [planned, "/api/v1/planned"],
    ] as const) {
      const r = await h(req(url));
      expect(r.status).toBe(200);
      const j = await body(r);
      expect(Array.isArray(j.data)).toBe(true);
      expect(j.meta.count).toBe(j.data.length);
      expect(new Date(j.meta.generatedAt).getTime()).toBeGreaterThan(0);
    }
  });

  test("sources filter and attribution", async () => {
    const j = await body(await sources(req("/api/v1/sources?country=zz&health=live")));
    expect(j.data).toHaveLength(0);
    const all = await body(await sources(req("/api/v1/sources?country=ZZ&mode=metro")));
    expect(all.data.map((s: any) => s.id)).toContain(SRC);
    expect(all.meta.attribution).toContain("Test attribution");
  });

  test("overview, health", async () => {
    const o = await body(await overview(req("/api/v1/overview")));
    expect(o.data.sources.total).toBeGreaterThan(0);
    const h = await body(await health(req("/api/v1/health")));
    expect(h.data.summary).toBeDefined();
  });

  test("source detail, alerts, lines", async () => {
    const s = await body(await source(req("/x"), params({ id: SRC })));
    expect(s.data.id).toBe(SRC);
    expect(s.data.lines).toHaveLength(1);
    const a = await body(await alerts(req("/api/v1/alerts?sourceId=" + SRC + "&minSeverity=major&q=zebra")));
    expect(a.data).toHaveLength(1);
    const l = await body(await lines(req("/api/v1/lines?sourceId=" + SRC + "&disrupted=true")));
    expect(l.data[0].lineId).toBe("zebra");
  });

  test("stations, board, services", async () => {
    const s = await body(await station(req("/x"), params({ id: "tzz" })));
    expect(s.data.stationId).toBe("TZZ");
    const b = await body(await board(req("/x?direction=departure"), params({ id: "TZZ" })));
    expect(b.data[0].service).toBe("TZ1234");
    const f = await body(await service(req("/x"), params({ q: "tz-1234" })));
    expect(f.data).toHaveLength(1);
  });

  test("vehicles by bbox, source and radius", async () => {
    const bb = await vehicles(req("/api/v1/vehicles?bbox=19.9,9.9,20.1,10.1"));
    expect((await body(bb)).data.map((v: any) => v.id)).toContain("v1");
    expect(bb.headers.get("Cache-Control")).toContain("s-maxage=10");
    expect((await body(await vehicles(req("/api/v1/vehicles?sourceId=" + SRC)))).data).toHaveLength(1);
    const near = await body(await vehicles(req("/api/v1/vehicles?lat=10&lon=20&radiusKm=5")));
    expect(near.data[0].distanceKm).toBeGreaterThan(0);
  });

  test("search", async () => {
    const j = await body(await search(req("/api/v1/search?q=zebra")));
    expect(j.data.some((h: any) => h.sourceId === SRC)).toBe(true);
  });
});

describe("errors", () => {
  const bad = async (r: Response) => {
    expect(r.status).toBe(400);
    const j = await body(r);
    expect(j.error.code).toBe("bad_request");
    expect(typeof j.error.message).toBe("string");
  };
  test("400 on bad params", async () => {
    await bad(await search(req("/api/v1/search")));
    await bad(await search(req("/api/v1/search?q=a")));
    await bad(await vehicles(req("/api/v1/vehicles")));
    await bad(await vehicles(req("/api/v1/vehicles?bbox=1,2,3")));
    await bad(await vehicles(req("/api/v1/vehicles?bbox=10,0,5,1")));
    await bad(await vehicles(req("/api/v1/vehicles?lat=10&lon=20")));
    await bad(await alerts(req("/api/v1/alerts?severity=nope")));
    await bad(await alerts(req("/api/v1/alerts?since=yesterday")));
    await bad(await alerts(req("/api/v1/alerts?limit=0")));
    await bad(await sources(req("/api/v1/sources?country=gbr")));
    await bad(await stations(req("/api/v1/stations?mode=hovercraft")));
    await bad(await service(req("/x"), params({ q: "a" })));
  });
  test("404 on unknown ids", async () => {
    for (const r of [
      await source(req("/x"), params({ id: "test-nope" })),
      await station(req("/x"), params({ id: "NOPE9" })),
      await board(req("/x"), params({ id: "NOPE9" })),
    ]) {
      expect(r.status).toBe(404);
      expect((await body(r)).error.code).toBe("not_found");
    }
  });
});

describe("headers", () => {
  test("CORS and cache", async () => {
    const r = await sources(req("/api/v1/sources"));
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=20, stale-while-revalidate=60");
    const e = await search(req("/api/v1/search"));
    expect(e.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
