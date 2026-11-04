import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { adelaideMode, auAdelaideMetro } from "./au-adelaide-metro";

test("au-adelaide-metro live alerts", async () => {
  const r = await runConnector(auAdelaideMetro);
  expect(r.alerts!.length).toBeGreaterThan(0);
  expect(Array.isArray(r.vehicles)).toBe(true);
}, 45_000);

test("adelaide route ids map to modes", () => {
  expect(adelaideMode("GLNELG")).toBe("tram");
  expect(adelaideMode("SEAFRD")).toBe("rail");
  expect(adelaideMode("G10")).toBe("bus");
  expect(adelaideMode(undefined)).toBe("bus");
});
