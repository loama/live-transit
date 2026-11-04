import { expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { frSncfAlerts } from "./fr-sncf-alerts";

test("sncf live alerts", async () => {
  const r = await runConnector(frSncfAlerts);
  expect(r.alerts!.length).toBeGreaterThan(20);
  expect(r.alerts![0].title.length).toBeGreaterThan(3);
}, 45_000);
