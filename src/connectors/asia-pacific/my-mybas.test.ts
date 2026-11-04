import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { myMybas } from "./my-mybas";

test("my-mybas live vehicles", async () => {
  const r = await runConnector(myMybas);
  expect(r.vehicles!.length).toBeGreaterThan(0);
}, 45_000);
