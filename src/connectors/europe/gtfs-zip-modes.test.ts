import { expect, test } from "bun:test";
import { makeContext } from "@/lib/http";
import { fetchZipRoutes, modeFromRouteType, parseCsvLine, routeModesFromCsv } from "./gtfs-zip-modes";

test("route_type mapping covers basic and extended codes", () => {
  expect(modeFromRouteType(0)).toBe("tram");
  expect(modeFromRouteType(1)).toBe("metro");
  expect(modeFromRouteType(2)).toBe("rail");
  expect(modeFromRouteType(3)).toBe("bus");
  expect(modeFromRouteType(4)).toBe("ferry");
  expect(modeFromRouteType(700)).toBe("bus");
  expect(modeFromRouteType(900)).toBe("tram");
  expect(modeFromRouteType(401)).toBe("metro");
});

test("csv parsing handles quotes", () => {
  expect(parseCsvLine('a,"b,c","d ""e"""')).toEqual(["a", "b,c", 'd "e"']);
  const m = routeModesFromCsv('route_id,route_long_name,route_type\n1,"X, Y",0\n2,Z,3\n');
  expect(m).toEqual({ "1": "tram", "2": "bus" });
});

test("reads routes.txt from a remote zip via range requests", async () => {
  const ctx = makeContext(AbortSignal.timeout(30_000));
  const csv = await fetchZipRoutes(ctx, "https://gtfs.ovapi.nl/nl/gtfs-nl.zip");
  const m = routeModesFromCsv(csv);
  expect(Object.keys(m).length).toBeGreaterThan(1000);
  expect(new Set(Object.values(m)).has("tram")).toBe(true);
}, 60_000);
