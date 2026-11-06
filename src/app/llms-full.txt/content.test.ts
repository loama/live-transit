import { describe, test, expect } from "bun:test";
import { generateFullListing } from "./content";

describe("llms-full.txt", () => {
  test("generates network listing with structure", async () => {
    const content = await generateFullListing();
    expect(content).toContain("# Live Transit - Full Network Coverage");
    expect(content).toContain("## Networks by Country");
    expect(content).toContain("## Usage");
    expect(content.length).toBeGreaterThan(1000);
    expect(content.length).toBeLessThan(200000);
  });

  test("includes network entries with proper format", async () => {
    const content = await generateFullListing();
    expect(content).toMatch(/\*\*[^*]+\*\* \([^)]+\)/);
    expect(content).toMatch(/Modes: [a-z, ]+/);
    expect(content).toMatch(/Data: [a-z, ]+/);
    expect(content).toMatch(/\/n\/[^\s]+/);
  });

  test("includes country headings", async () => {
    const content = await generateFullListing();
    expect(content).toMatch(/### [A-Z][a-z ]+/);
  });
});
