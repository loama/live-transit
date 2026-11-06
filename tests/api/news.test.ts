import { describe, expect, test } from "bun:test";
import { GET as getNews } from "@/app/api/v1/news/route";

function req(url: string): Request {
  return new Request(`https://example.org${url}`);
}

describe("/api/v1/news", () => {
  test("returns all news items", async () => {
    const r = await getNews(req("/api/v1/news"));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ id: string; date: string; title: string; country: string; kind: string }> };
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
    for (const item of data.data) {
      expect(item.id).toBeDefined();
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.title).toBeDefined();
      expect(item.country).toMatch(/^[a-z]{2}$/);
      expect(item.kind).toBeDefined();
    }
  });

  test("filters by country", async () => {
    const r = await getNews(req("/api/v1/news?country=us"));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ country: string }> };
    expect(data.data.every((item) => item.country === "us")).toBe(true);
  });

  test("filters by kind", async () => {
    const r = await getNews(req("/api/v1/news?kind=closure"));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ kind: string }> };
    expect(data.data.every((item) => item.kind === "closure")).toBe(true);
  });

  test("filters by sourceId", async () => {
    const r = await getNews(req("/api/v1/news?sourceId=us-sf-bart"));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ sourceIds: string[] }> };
    expect(data.data.every((item) => item.sourceIds.includes("us-sf-bart"))).toBe(true);
  });

  test("filters by since date", async () => {
    const r = await getNews(req("/api/v1/news?since=2026-11-01"));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ date: string }> };
    expect(data.data.every((item) => item.date >= "2026-11-01")).toBe(true);
  });

  test("respects limit", async () => {
    const r = await getNews(req("/api/v1/news?limit=1"));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ id: string }> };
    expect(data.data.length).toBeLessThanOrEqual(1);
  });

  test("returns empty array when no matches", async () => {
    const r = await getNews(req("/api/v1/news?country=zz"));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { data: Array<{ id: string }> };
    expect(data.data).toEqual([]);
  });

  test("validates invalid country code", async () => {
    const r = await getNews(req("/api/v1/news?country=USA"));
    expect(r.status).toBe(400);
  });

  test("validates invalid kind", async () => {
    const r = await getNews(req("/api/v1/news?kind=invalid"));
    expect(r.status).toBe(400);
  });
});
