import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { auAdelaideMetro } from "./au-adelaide-metro";

test("au-adelaide-metro live alerts", async () => {
  const r = await runConnector(auAdelaideMetro);
  expect(r.alerts!.length).toBeGreaterThan(0);
  expect(Array.isArray(r.vehicles)).toBe(true);
}, 45_000);
