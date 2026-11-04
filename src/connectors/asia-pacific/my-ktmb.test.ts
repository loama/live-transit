import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { myKtmb } from "./my-ktmb";

test("my-ktmb live vehicles", async () => {
  const r = await runConnector(myKtmb);
  expect(r.vehicles!.length).toBeGreaterThan(0);
}, 45_000);
