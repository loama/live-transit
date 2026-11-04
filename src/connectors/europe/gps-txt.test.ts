import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { eeTallinnTransport, tallinnMode } from "./ee-tallinn-transport";
import { parseGpsTxt } from "./gps-txt";
import { ltVilniusTransport } from "./lt-vilnius-transport";

describe("gps.txt connectors", () => {
  test("parser", () => {
    const [v] = parseGpsTxt("3,T2,24757160,59443310,36,231,99,Z,51,Lennujaam\n", tallinnMode);
    expect(v).toMatchObject({ mode: "tram", lat: 59.44331, lon: 24.75716, speed: 10, bearing: 231, headsign: "Lennujaam", routeName: "T2" });
  });
  test("tallinn live", async () => {
    const r = await runConnector(eeTallinnTransport);
    expect(r.vehicles!.length).toBeGreaterThan(100);
  }, 30_000);
  test("vilnius live", async () => {
    const r = await runConnector(ltVilniusTransport);
    expect(r.vehicles!.length).toBeGreaterThan(100);
  }, 30_000);
});
