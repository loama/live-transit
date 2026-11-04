import { cacheLife } from "next/cache";
import * as q from "@/db/queries";
import { plannedSources } from "@/connectors/planned";

/**
 * Every read is cached for 30 seconds. Lifetimes under 5 minutes are excluded from
 * prerendering, so nothing here runs at build time. Callers must sit under <Suspense>.
 */
function live() {
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
}

export async function getOverview() {
  "use cache";
  live();
  return q.overview();
}

export async function getSources(f: q.SourceFilter = {}) {
  "use cache";
  live();
  return q.listSources(f);
}

export async function getSourceDetail(id: string) {
  "use cache";
  live();
  return q.getSource(id);
}

export async function getAlerts(f: Omit<q.AlertFilter, "since"> = {}) {
  "use cache";
  live();
  return q.listAlerts(f);
}

export async function getLines(f: Parameters<typeof q.listLines>[0] = {}) {
  "use cache";
  live();
  return q.listLines(f);
}

export async function getStations(f: Parameters<typeof q.listStations>[0] = {}) {
  "use cache";
  live();
  return q.listStations(f);
}

export async function getStationById(id: string) {
  "use cache";
  live();
  return q.getStation(id);
}

export async function getStationBoard(stationId: string, direction?: "departure" | "arrival") {
  "use cache";
  live();
  return q.getBoard({ stationId, direction, limit: 120 });
}

export async function getVehiclesBySource(sourceId: string) {
  "use cache";
  live();
  return q.vehiclesBySource(sourceId);
}

export async function getHealth() {
  "use cache";
  live();
  return q.health();
}

export async function getPlanned() {
  return plannedSources;
}
