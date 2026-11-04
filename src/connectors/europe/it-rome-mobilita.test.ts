import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { itRomeMobilita, romeMode } from "./it-rome-mobilita";

test("rome live feed", async () => {
  const r = await runConnector(itRomeMobilita);
  expect(r.vehicles!.length).toBeGreaterThan(300);
  expect(r.alerts!.length).toBeGreaterThan(10);
}, 45_000);

test("rome route ids map to modes", () => {
  expect(romeMode("MEB1")).toBe("metro");
  expect(romeMode("8")).toBe("tram");
  expect(romeMode("2BUS")).toBe("bus");
  expect(romeMode("105")).toBe("bus");
});
