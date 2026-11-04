import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { calgaryTransit } from "./calgary";
import { edmontonEts } from "./edmonton";
import { halifaxTransit } from "./halifax";
import { hamiltonHsr } from "./hamilton";
import { kingCountyMetro } from "./kcm";
import { marta } from "./marta";
import { metroTransitMn } from "./metrotransit";
import { nycFerry } from "./nycferry";
import { rtdDenver } from "./rtd";

describe("gtfs-rt connectors", () => {
  const cases: [string, Parameters<typeof runConnector>[0], number][] = [
    ["king county metro", kingCountyMetro, 100],
    ["metro transit minneapolis", metroTransitMn, 100],
    ["edmonton", edmontonEts, 100],
    ["calgary", calgaryTransit, 50],
    ["marta", marta, 50],
    ["nyc ferry", nycFerry, 3],
    ["halifax", halifaxTransit, 50],
    ["hamilton", hamiltonHsr, 50],
    ["denver rtd", rtdDenver, 100],
  ];
  for (const [name, c, min] of cases)
    test(name, async () => {
      const r = await runConnector(c);
      expect(r.vehicles!.length).toBeGreaterThanOrEqual(min);
      expect(new Set(r.vehicles!.map((v) => v.id)).size).toBe(r.vehicles!.length);
    }, 30_000);
});
