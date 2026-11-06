import { describe, expect, test } from "bun:test";
import { validateNews, sortNews, filterNews, NEWS_KINDS } from "@/lib/news";
import type { NewsItem } from "@/lib/news";

describe("news schema", () => {
  test("validates valid news items", () => {
    const items = [
      {
        id: "test-1",
        date: "2026-11-01",
        title: "New Line Opening",
        summary: "A new metro line opens tomorrow.",
        url: "https://example.org/news/1",
        sourceIds: ["test-network"],
        country: "us",
        kind: "new_line",
      },
    ];
    expect(() => validateNews(items)).not.toThrow();
  });

  test("rejects invalid date format", () => {
    const items = [
      {
        id: "test-1",
        date: "11/01/2026",
        title: "Test",
        summary: "Summary",
        url: "https://example.org",
        sourceIds: [],
        country: "us",
        kind: "other",
      },
    ];
    expect(() => validateNews(items)).toThrow();
  });

  test("rejects invalid country code", () => {
    const items = [
      {
        id: "test-1",
        date: "2026-11-01",
        title: "Test",
        summary: "Summary",
        url: "https://example.org",
        sourceIds: [],
        country: "USA",
        kind: "other",
      },
    ];
    expect(() => validateNews(items)).toThrow();
  });

  test("rejects invalid kind", () => {
    const items = [
      {
        id: "test-1",
        date: "2026-11-01",
        title: "Test",
        summary: "Summary",
        url: "https://example.org",
        sourceIds: [],
        country: "us",
        kind: "invalid_kind",
      },
    ];
    expect(() => validateNews(items)).toThrow();
  });

  test("rejects invalid URL", () => {
    const items = [
      {
        id: "test-1",
        date: "2026-11-01",
        title: "Test",
        summary: "Summary",
        url: "not-a-url",
        sourceIds: [],
        country: "us",
        kind: "other",
      },
    ];
    expect(() => validateNews(items)).toThrow();
  });
});

describe("sortNews", () => {
  test("sorts by date descending", () => {
    const items: NewsItem[] = [
      {
        id: "a",
        date: "2026-11-01",
        title: "First",
        summary: "Summary",
        url: "https://example.org",
        sourceIds: [],
        country: "us",
        kind: "other",
      },
      {
        id: "b",
        date: "2026-11-03",
        title: "Latest",
        summary: "Summary",
        url: "https://example.org",
        sourceIds: [],
        country: "us",
        kind: "other",
      },
      {
        id: "c",
        date: "2026-11-02",
        title: "Middle",
        summary: "Summary",
        url: "https://example.org",
        sourceIds: [],
        country: "us",
        kind: "other",
      },
    ];
    const sorted = sortNews(items);
    expect(sorted.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  test("stable sort by id when dates equal", () => {
    const items: NewsItem[] = [
      {
        id: "z",
        date: "2026-11-01",
        title: "Z",
        summary: "Summary",
        url: "https://example.org",
        sourceIds: [],
        country: "us",
        kind: "other",
      },
      {
        id: "a",
        date: "2026-11-01",
        title: "A",
        summary: "Summary",
        url: "https://example.org",
        sourceIds: [],
        country: "us",
        kind: "other",
      },
    ];
    const sorted = sortNews(items);
    expect(sorted.map((i) => i.id)).toEqual(["a", "z"]);
  });
});

describe("filterNews", () => {
  const items: NewsItem[] = [
    {
      id: "us-1",
      date: "2026-11-01",
      title: "US Closure",
      summary: "Summary",
      url: "https://example.org",
      sourceIds: ["us-network-1"],
      country: "us",
      kind: "closure",
    },
    {
      id: "gb-1",
      date: "2026-11-01",
      title: "GB New Line",
      summary: "Summary",
      url: "https://example.org",
      sourceIds: ["gb-network-1"],
      country: "gb",
      kind: "new_line",
    },
    {
      id: "us-2",
      date: "2026-11-01",
      title: "US Fare Change",
      summary: "Summary",
      url: "https://example.org",
      sourceIds: ["us-network-1", "us-network-2"],
      country: "us",
      kind: "fares",
    },
  ];

  test("filters by country", () => {
    const filtered = filterNews(items, { country: "us" });
    expect(filtered.map((i) => i.id)).toEqual(["us-1", "us-2"]);
  });

  test("filters by kind", () => {
    const filtered = filterNews(items, { kind: "closure" });
    expect(filtered.map((i) => i.id)).toEqual(["us-1"]);
  });

  test("filters by sourceId", () => {
    const filtered = filterNews(items, { sourceId: "us-network-1" });
    expect(filtered.map((i) => i.id)).toEqual(["us-1", "us-2"]);
  });

  test("combines filters", () => {
    const filtered = filterNews(items, { country: "us", kind: "fares" });
    expect(filtered.map((i) => i.id)).toEqual(["us-2"]);
  });

  test("returns all when no filters", () => {
    const filtered = filterNews(items, {});
    expect(filtered.length).toBe(3);
  });
});
