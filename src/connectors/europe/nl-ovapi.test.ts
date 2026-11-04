import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { nlOvapi } from "./nl-ovapi";

test("ovapi live feed", async () => {
  const r = await runConnector(nlOvapi);
  expect(r.vehicles!.length).toBeGreaterThan(500);
  expect(r.alerts!.length).toBeGreaterThan(10);
}, 60_000);
