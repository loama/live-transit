import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { myPrasaranaBus } from "./my-prasarana-bus";

test("my-prasarana-bus live vehicles", async () => {
  const r = await runConnector(myPrasaranaBus);
  expect(r.vehicles!.length).toBeGreaterThan(0);
}, 45_000);
