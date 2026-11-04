import { z } from "zod";
import { vehiclesBySource, vehiclesInBbox, vehiclesNear } from "@/db/queries";
import { ApiError, handler, ok, options, parseQuery, q } from "../_lib";

const schema = z.object({
  bbox: z.string().optional(),
  sourceId: q.text(100),
  lat: q.num(-90, 90).optional(),
  lon: q.num(-180, 180).optional(),
  radiusKm: q.num(0.1, 100).optional(),
  mode: q.mode,
  limit: q.limit(5000),
});

function parseBbox(s: string) {
  const p = s.split(",").map((x) => (x.trim() === "" ? NaN : Number(x)));
  const [minLon, minLat, maxLon, maxLat] = p;
  const valid =
    p.length === 4 && p.every(Number.isFinite) && minLon >= -180 && maxLon <= 180 && minLat >= -90 && maxLat <= 90 &&
    minLon <= maxLon && minLat <= maxLat;
  if (!valid) throw new ApiError(400, "bad_request", "bbox: expected minLon,minLat,maxLon,maxLat within valid ranges");
  return { minLon, minLat, maxLon, maxLat };
}

export const GET = handler(async (req) => {
  const f = parseQuery(req, schema);
  const near = f.lat !== undefined || f.lon !== undefined || f.radiusKm !== undefined;
  let items;
  if (near) {
    if (f.lat === undefined || f.lon === undefined || f.radiusKm === undefined)
      throw new ApiError(400, "bad_request", "lat, lon and radiusKm must be given together");
    items = await vehiclesNear(f.lat, f.lon, f.radiusKm, f.mode, f.limit);
  } else if (f.bbox) {
    items = await vehiclesInBbox({ ...parseBbox(f.bbox), mode: f.mode, limit: f.limit });
  } else if (f.sourceId) {
    items = await vehiclesBySource(f.sourceId, f.limit);
    if (f.mode) items = items.filter((v) => v.mode === f.mode);
  } else {
    throw new ApiError(400, "bad_request", "Provide bbox, sourceId, or lat, lon and radiusKm");
  }
  return ok(items, {}, { vehicles: true });
});
export const OPTIONS = options;
