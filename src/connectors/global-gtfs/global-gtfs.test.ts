import { describe, expect, test } from "bun:test";
import { runConnector, validateMeta } from "../../../scripts/harness";
import { globalGtfs } from "./index";

describe("global-gtfs feeds", () => {
  test("has a sane number of sources", () => {
    expect(globalGtfs.length).toBeGreaterThan(50);
    expect(globalGtfs.length).toBeLessThanOrEqual(250);
  });

  test("every connector is well-formed with a unique gtfs- id", () => {
    const ids = new Set<string>();
    for (const c of globalGtfs) {
      validateMeta(c);
      expect(c.meta.id.startsWith("gtfs-")).toBe(true);
      expect(c.meta.kind).toBe("gtfs-rt");
      expect(c.meta.endpoints.length).toBeGreaterThan(0);
      expect(ids.has(c.meta.id)).toBe(false);
      ids.add(c.meta.id);
    }
  });

  test("live smoke: a random sample of 5 mostly works", async () => {
    const sample = [...globalGtfs].sort(() => Math.random() - 0.5).slice(0, 5);
    const results = await Promise.allSettled(sample.map((c) => runConnector(c)));
    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${sample[i].meta.id}: ${r.reason}`] : []));
    if (failed.length) console.warn(failed.join("\n"));
    expect(results.length - failed.length).toBeGreaterThanOrEqual(4);
  }, 120_000);
});
