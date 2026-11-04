import { connectorById } from "@/connectors";
import { db } from "@/db/client";
import { vehiclesBySource, type VehicleItem } from "@/db/queries";
import { makeContext } from "@/lib/http";
import { enrichVehicles, loadCatalog } from "./catalog";

const FRESH_MS = 8_000;
const memo = new Map<string, { at: number; p: Promise<VehicleItem[]> }>();

async function fromUpstream(sourceId: string): Promise<VehicleItem[]> {
  const c = connectorById.get(sourceId)!;
  const now = new Date();
  const [raw, cat] = await Promise.all([c.live!(makeContext(AbortSignal.timeout(10_000), now)), loadCatalog(db(), sourceId)]);
  return enrichVehicles(raw, cat).map((v) => ({
    sourceId,
    id: v.id,
    mode: v.mode,
    routeId: v.routeId ?? null,
    routeName: v.routeName ?? null,
    tripId: v.tripId ?? null,
    headsign: v.headsign ?? null,
    lat: v.lat,
    lon: v.lon,
    bearing: v.bearing ?? null,
    speed: v.speed ?? null,
    label: v.label ?? null,
    color: v.color ?? null,
    delaySeconds: v.delaySeconds ?? null,
    observedAt: v.observedAt?.toISOString() ?? null,
  }));
}

/**
 * Current vehicle positions for a source. Reads the operator's realtime feed directly when the connector
 * supports it (shared for a few seconds per instance), otherwise the last ingested snapshot.
 * `live` says which one was served.
 */
export async function liveVehicles(sourceId: string): Promise<{ vehicles: VehicleItem[]; live: boolean; at: Date } | null> {
  const c = connectorById.get(sourceId);
  if (!c) return null;
  if (c.live) {
    let m = memo.get(sourceId);
    if (!m || Date.now() - m.at > FRESH_MS) {
      m = { at: Date.now(), p: fromUpstream(sourceId) };
      m.p.catch(() => memo.delete(sourceId));
      memo.set(sourceId, m);
    }
    try {
      return { vehicles: await m.p, live: true, at: new Date(m.at) };
    } catch (e) {
      console.warn(`[live] ${sourceId} upstream failed, serving snapshot:`, (e as Error).message);
    }
  }
  return { vehicles: await vehiclesBySource(sourceId), live: false, at: new Date() };
}
