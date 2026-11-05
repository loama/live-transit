import { z } from "zod";
import { vehiclesBySource, vehiclesInBbox, vehiclesNear } from "@/db/queries";
import { ApiError, handler, ok, options, parseBbox, parseQuery, q } from "../_lib";

const schema = z.object({
  bbox: z.string().optional(),
  sourceId: q.text(200),
  lat: q.num(-90, 90).optional(),
  lon: q.num(-180, 180).optional(),
  radiusKm: q.num(0.1, 100).optional(),
  mode: q.mode,
  limit: q.limit(5000),
});

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
