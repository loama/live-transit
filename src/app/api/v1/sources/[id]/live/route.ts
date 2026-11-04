import { z } from "zod";
import { liveVehicles } from "@/ingest/live";
import { handler, json, notFound, options, parseQuery, q } from "../../../_lib";

const schema = z.object({ routeId: q.text(200) });

export const GET = handler(async (req, { id }) => {
  const { routeId } = parseQuery(req, schema);
  const r = await liveVehicles(id);
  if (!r) return notFound(`Unknown source "${id}"`);
  const data = routeId ? r.vehicles.filter((v) => v.routeId === routeId) : r.vehicles;
  return json(
    { data, meta: { generatedAt: r.at.toISOString(), count: data.length, live: r.live } },
    200,
    "public, s-maxage=10, stale-while-revalidate=20",
  );
});
export const OPTIONS = options;
