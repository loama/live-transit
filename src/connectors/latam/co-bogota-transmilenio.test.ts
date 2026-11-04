import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { alertsFromFeed, decodeFeed } from "@/lib/gtfs-rt";
import { validateMeta, validateResult } from "../../../scripts/harness";
import { transmilenio, withLineNames } from "./co-bogota-transmilenio";

// The feed rejects non-Colombian residential and EU IPs, so this test decodes a captured snapshot.
// Live reachability is verified from the production region and shown on /status.
const feed = decodeFeed(readFileSync(join(import.meta.dir, "fixtures/transmilenio-alerts.pb")));

test("transmilenio meta is valid", () => validateMeta(transmilenio));

test("alerts decode with line codes from the published text", () => {
  const alerts = withLineNames(alertsFromFeed(feed, { defaultMode: "bus", languages: ["es", ""] }, new Date("2026-11-04T17:00:00Z")));
  validateResult(transmilenio.meta.id, { alerts });
  expect(alerts.length).toBeGreaterThan(100);
  const dk = alerts.find((a) => a.routes?.[0] === "DK211");
  expect(dk?.title).toBe("DK211: PMT VILLA GLADYZ");
  expect(dk?.effect).toBe("DETOUR");
});
