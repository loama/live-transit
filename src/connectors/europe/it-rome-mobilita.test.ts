import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { itRomeMobilita } from "./it-rome-mobilita";

test("rome live feed", async () => {
  const r = await runConnector(itRomeMobilita);
  expect(r.vehicles!.length).toBeGreaterThan(300);
  expect(r.alerts!.length).toBeGreaterThan(10);
}, 45_000);
