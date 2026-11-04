// Encoded polylines (Google format, 5 decimal places) and Douglas-Peucker simplification.
// Points are [lon, lat] pairs throughout, matching GeoJSON.

export type Point = [number, number];

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let out = "";
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return out + String.fromCharCode(n + 63);
}

export function encodePolyline(points: Point[]): string {
  let out = "";
  let pLat = 0;
  let pLon = 0;
  for (const [lon, lat] of points) {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lon * 1e5);
    out += encodeValue(la - pLat) + encodeValue(lo - pLon);
    pLat = la;
    pLon = lo;
  }
  return out;
}

export function decodePolyline(s: string): Point[] {
  const out: Point[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < s.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    lat += next();
    lon += next();
    out.push([lon / 1e5, lat / 1e5]);
  }
  return out;
}

/** Douglas-Peucker on an equirectangular projection; `tolerance` is in meters. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const lat0 = (points[0][1] * Math.PI) / 180;
  const kx = 111_320 * Math.cos(lat0);
  const ky = 110_540;
  const xs = points.map((p) => p[0] * kx);
  const ys = points.map((p) => p[1] * ky);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len2 = dx * dx + dy * dy;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      let d: number;
      if (len2 === 0) d = (xs[i] - xs[a]) ** 2 + (ys[i] - ys[a]) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((xs[i] - xs[a]) * dx + (ys[i] - ys[a]) * dy) / len2));
        d = (xs[i] - xs[a] - t * dx) ** 2 + (ys[i] - ys[a] - t * dy) ** 2;
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export interface Bbox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export function bboxOf(lines: Point[][]): Bbox | undefined {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const l of lines)
    for (const [lon, lat] of l) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  return Number.isFinite(minLat) ? { minLat, minLon, maxLat, maxLon } : undefined;
}
