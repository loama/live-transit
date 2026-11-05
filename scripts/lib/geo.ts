// Country and nearest-city lookup from Natural Earth (public domain): point-in-polygon on admin-0 boundaries and
// the closest populated place. Expects countries.geojson (ne_10m_admin_0_countries) and places.geojson
// (ne_10m_populated_places_simple) in `dir`.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadGeo(neDir: string) {
  type Ring = [number, number][];
  interface Country { iso: string; bbox: [number, number, number, number]; polys: Ring[][] }

  const geo = JSON.parse(readFileSync(join(neDir, "countries.geojson"), "utf8")) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] };
  const countries: Country[] = geo.features.map((f) => {
    const p = f.properties;
    const iso = [p.ISO_A2, p.ISO_A2_EH, p.WB_A2].find((x) => x && /^[A-Z]{2}$/.test(x)) ?? "";
    const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
    const pts = polys.flat(2);
    const bbox: Country["bbox"] = [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
    return { iso: iso.toLowerCase(), bbox, polys };
  }).filter((c) => c.iso);

  function inRing(x: number, y: number, r: Ring) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function countryAt(lon: number, lat: number): string | undefined {
    for (const c of countries) {
      if (lon < c.bbox[0] || lon > c.bbox[2] || lat < c.bbox[1] || lat > c.bbox[3]) continue;
      if (c.polys.some((poly) => inRing(lon, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lon, lat, hole)))) return c.iso;
    }
    return undefined;
  }

  const places = (JSON.parse(readFileSync(join(neDir, "places.geojson"), "utf8")) as { features: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }[] })
    .features.map((f) => ({ name: f.properties.name, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));

  function nearestPlace(lon: number, lat: number, maxKm = 60): string | undefined {
    let best: string | undefined;
    let bestD = maxKm;
    const k = Math.cos((lat * Math.PI) / 180);
    for (const p of places) {
      const d = Math.hypot((p.lon - lon) * 111 * k, (p.lat - lat) * 111);
      if (d < bestD) {
        bestD = d;
        best = p.name;
      }
    }
    return best;
  }

  return { countryAt, nearestPlace };
}
