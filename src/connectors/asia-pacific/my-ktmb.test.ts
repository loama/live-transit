import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { myKtmb } from "./my-ktmb";

const klHour = Number(
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kuala_Lumpur" }).format(new Date()),
);

test("my-ktmb live vehicles", async () => {
  const r = await runConnector(myKtmb);
  expect(Array.isArray(r.vehicles)).toBe(true);
  // KTMB runs roughly 05:30 to 00:30 local time; outside that window an empty snapshot is correct.
  if (klHour >= 6 && klHour < 23) expect(r.vehicles!.length).toBeGreaterThan(0);
}, 45_000);
