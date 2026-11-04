import { describe, expect, test } from "bun:test";
import { encodePolyline, decodePolyline, simplify, bboxOf } from "./polyline";

describe("polyline", () => {
  test("encode/decode round trip with known Google example", () => {
    const points: [number, number][] = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
    expect(encodePolyline(points)).toBe(encoded);
    const decoded = decodePolyline(encoded);
    expect(decoded.length).toBe(3);
    for (let i = 0; i < points.length; i++) {
      expect(decoded[i][0]).toBeCloseTo(points[i][0], 4);
      expect(decoded[i][1]).toBeCloseTo(points[i][1], 4);
    }
  });

  test("simplify keeps endpoints and removes collinear points", () => {
    const straight: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    const simplified = simplify(straight, 0.001);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[1]).toEqual([3, 3]);

    const zigzag: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ];
    const simplified2 = simplify(zigzag, 0.001);
    expect(simplified2.length).toBe(4);
  });

  test("bboxOf computes correct bounds", () => {
    const points: [number, number][][] = [
      [[-10, 5], [20, -3], [0, 15]],
    ];
    const bbox = bboxOf(points);
    expect(bbox).toEqual({ minLon: -10, minLat: -3, maxLon: 20, maxLat: 15 });
  });

  test("bboxOf handles single point", () => {
    const points: [number, number][][] = [[[5, 10]]];
    const bbox = bboxOf(points);
    expect(bbox).toEqual({ minLon: 5, minLat: 10, maxLon: 5, maxLat: 10 });
  });

  test("encode/decode handles empty array", () => {
    expect(encodePolyline([])).toBe("");
    expect(decodePolyline("")).toEqual([]);
  });
});
