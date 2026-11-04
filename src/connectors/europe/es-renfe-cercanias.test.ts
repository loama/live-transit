import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { esRenfeCercanias } from "./es-renfe-cercanias";

test("renfe live feed", async () => {
  const r = await runConnector(esRenfeCercanias);
  expect(r.vehicles!.length).toBeGreaterThan(50);
  expect(r.alerts).toBeDefined();
  expect(new Set(r.alerts!.map((a) => a.id)).size).toBe(r.alerts!.length);
}, 45_000);
