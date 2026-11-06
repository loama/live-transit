import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db/client";
import { GET as searchAPI } from "@/app/api/v1/search/route";
import { cleanup, req } from "./fixtures";
import { upsertSources } from "@/db/persist";
import type { SourceMeta } from "@/lib/types";

const VIENNA_SRC = "test-search-vienna";
const MUNICH_SRC = "test-search-munich";
const LONDON_SRC = "test-search-london";

const meta = (id: string, city: string, country: string, lat: number, lon: number): SourceMeta => ({
  id, name: `${city} Transit`, operator: `${city} Operator`, country, city, region: "europe", modes: ["metro"],
  kind: "api", homepage: "https://example.org", endpoints: ["https://example.org/feed"], attribution: "Test",
  intervalMinutes: 5, lat, lon,
});

beforeAll(async () => {
  await cleanup();
  const sql = db();
  await upsertSources(sql, [
    meta(VIENNA_SRC, "Vienna", "at", 48.2082, 16.3738),
    meta(MUNICH_SRC, "Munich", "de", 48.1351, 11.5820),
    meta(LONDON_SRC, "London", "gb", 51.5074, -0.1278),
  ]);
});

afterAll(async () => {
  const sql = db();
  await sql`DELETE FROM sources WHERE id IN (${VIENNA_SRC}, ${MUNICH_SRC}, ${LONDON_SRC})`;
});

describe("Multilingual place search", () => {
  test("finds Vienna by German name (Wien)", async () => {
    const r = await searchAPI(req("/api/v1/search?q=Wien&limit=10"));
    expect(r.status).toBe(200);
    const data = await r.json() as { data: Array<{ type: string; sourceId: string; title: string; subtitle: string }> };
    const viennaHit = data.data.find(h => h.sourceId === VIENNA_SRC || h.subtitle.includes("Vienna"));
    expect(viennaHit).toBeDefined();
  });

  test("finds Vienna by Spanish name (Viena)", async () => {
    const r = await searchAPI(req("/api/v1/search?q=Viena&limit=10"));
    expect(r.status).toBe(200);
    const data = await r.json() as { data: Array<{ type: string; sourceId: string; title: string; subtitle: string }> };
    const viennaHit = data.data.find(h => h.sourceId === VIENNA_SRC || h.subtitle.includes("Vienna"));
    expect(viennaHit).toBeDefined();
  });

  test("finds Munich by German name (München)", async () => {
    const r = await searchAPI(req("/api/v1/search?q=München&limit=10"));
    expect(r.status).toBe(200);
    const data = await r.json() as { data: Array<{ type: string; sourceId: string; title: string; subtitle: string }> };
    const munichHit = data.data.find(h => h.sourceId === MUNICH_SRC || h.subtitle.includes("Munich"));
    expect(munichHit).toBeDefined();
  });

  test("finds Munich by accent-free spelling (Munchen)", async () => {
    const r = await searchAPI(req("/api/v1/search?q=Munchen&limit=10"));
    expect(r.status).toBe(200);
    const data = await r.json() as { data: Array<{ type: string; sourceId: string; title: string; subtitle: string }> };
    const munichHit = data.data.find(h => h.sourceId === MUNICH_SRC || h.subtitle.includes("Munich"));
    expect(munichHit).toBeDefined();
  });

  test("finds London by Spanish name (Londres)", async () => {
    const r = await searchAPI(req("/api/v1/search?q=Londres&limit=10"));
    expect(r.status).toBe(200);
    const data = await r.json() as { data: Array<{ type: string; sourceId: string; title: string; subtitle: string }> };
    const londonHit = data.data.find(h => h.sourceId === LONDON_SRC || h.subtitle.includes("London"));
    expect(londonHit).toBeDefined();
  });

  test("finds by country name in Spanish (Alemania for Germany)", async () => {
    const r = await searchAPI(req("/api/v1/search?q=Alemania&limit=20"));
    expect(r.status).toBe(200);
    const data = await r.json() as { data: Array<{ type: string; sourceId: string; subtitle: string }> };
    const germanHit = data.data.find(h => h.subtitle.toUpperCase().includes("DE"));
    expect(germanHit).toBeDefined();
  });

  test("finds by country name in German (Deutschland for Germany)", async () => {
    const r = await searchAPI(req("/api/v1/search?q=Deutschland&limit=20"));
    expect(r.status).toBe(200);
    const data = await r.json() as { data: Array<{ type: string; sourceId: string; subtitle: string }> };
    const germanHit = data.data.find(h => h.subtitle.toUpperCase().includes("DE"));
    expect(germanHit).toBeDefined();
  });
});
