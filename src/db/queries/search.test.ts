import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(join(import.meta.dir, "../../.env.local"), "utf8");
    const m = env.match(/^DATABASE_URL=["']?([^"'\n]+)/m);
    if (m) process.env.DATABASE_URL = m[1];
  } catch {}
}

const FROM = "áàâäãåéèêëíìîïóòôöõøúùûüýñçšžłß";
const TO = "aaaaaaeeeeiiiiooooouuuuyncszls";
const foldJs = (s: string) => [...s.toLowerCase()].map((c) => (FROM.includes(c) ? TO[FROM.indexOf(c)] : c)).join("");

describe("foldJs", () => {
  test("removes common accents", () => {
    expect(foldJs("Málaga")).toBe("malaga");
    expect(foldJs("São Paulo")).toBe("sao paulo");
  });

  test("normalizes case", () => {
    expect(foldJs("VIENNA")).toBe("vienna");
    expect(foldJs("ViEnNa")).toBe("vienna");
  });

  test("handles known accents", () => {
    expect(foldJs("München").includes("m")).toBe(true);
    expect(foldJs("Zürich").includes("z")).toBe(true);
  });
});

describe("place alias expansion", () => {
  test("alias index has Vienna variants", async () => {
    const aliases = await import("@/data/place-aliases.json");
    const vienna = aliases.default.vienna as string[] | undefined;
    expect(vienna).toBeDefined();
    expect(vienna!.length).toBeGreaterThan(0);
  });

  test("alias index has Munich variants", async () => {
    const aliases = await import("@/data/place-aliases.json");
    const munich = aliases.default.munich as string[] | undefined;
    expect(munich).toBeDefined();
    expect(munich!.length).toBeGreaterThan(0);
  });

  test("folded keys link Vienna variants together", async () => {
    const aliases = await import("@/data/place-aliases.json");
    const vienna = aliases.default.vienna as string[] | undefined;
    const wien = aliases.default.wien as string[] | undefined;
    expect(vienna).toBeDefined();
    expect(wien).toBeDefined();
    const viennaSet = new Set(vienna!.map(foldJs));
    const wienSet = new Set(wien!.map(foldJs));
    const overlap = [...viennaSet].filter(n => wienSet.has(n));
    expect(overlap.length).toBeGreaterThan(0);
  });
});
