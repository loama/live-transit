import { cacheLife } from "next/cache";
import { connection } from "next/server";
import * as q from "@/db/queries";
import { plannedSources } from "@/connectors/planned";

/**
 * Every read is cached for 30 seconds. Lifetimes under 5 minutes are excluded from
 * prerendering, and every exported reader awaits connection() first, so the database is never
 * touched while building. Callers must sit under <Suspense>.
 */
function live() {
  cacheLife({ stale: 30, revalidate: 30, expire: 240 });
}

async function cached_getOverview() {
  "use cache";
  live();
  return q.overview();
}

async function cached_getSources(f: q.SourceFilter = {}) {
  "use cache";
  live();
  return q.listSources(f);
}

async function cached_getSourceDetail(id: string) {
  "use cache";
  live();
  return q.getSource(id);
}

async function cached_getAlerts(f: Omit<q.AlertFilter, "since"> = {}) {
  "use cache";
  live();
  return q.listAlerts(f);
}

async function cached_getLines(f: Parameters<typeof q.listLines>[0] = {}) {
  "use cache";
  live();
  return q.listLines(f);
}

async function cached_getStations(f: Parameters<typeof q.listStations>[0] = {}) {
  "use cache";
  live();
  return q.listStations(f);
}

async function cached_getStationById(id: string) {
  "use cache";
  live();
  return q.getStation(id);
}

async function cached_getStationBoard(stationId: string, direction?: "departure" | "arrival") {
  "use cache";
  live();
  return q.getBoard({ stationId, direction, limit: 120 });
}

async function cached_getVehiclesBySource(sourceId: string) {
  "use cache";
  live();
  return q.vehiclesBySource(sourceId);
}

async function cached_getLine(sourceId: string, lineId: string) {
  "use cache";
  live();
  return q.getLine(sourceId, lineId);
}

async function cached_getRoutes(sourceId: string) {
  "use cache";
  live();
  return q.listRoutes({ sourceId, limit: 5000 });
}

async function cached_getHealth() {
  "use cache";
  live();
  return q.health();
}


export async function getOverview() {
  await connection();
  return cached_getOverview();
}

export async function getSources(f: q.SourceFilter = {}) {
  await connection();
  return cached_getSources(f);
}

export async function getSourceDetail(id: string) {
  await connection();
  return cached_getSourceDetail(id);
}

export async function getAlerts(f: Omit<q.AlertFilter, "since"> = {}) {
  await connection();
  return cached_getAlerts(f);
}

export async function getLines(f: Parameters<typeof q.listLines>[0] = {}) {
  await connection();
  return cached_getLines(f);
}

export async function getStations(f: Parameters<typeof q.listStations>[0] = {}) {
  await connection();
  return cached_getStations(f);
}

export async function getStationById(id: string) {
  await connection();
  return cached_getStationById(id);
}

export async function getStationBoard(stationId: string, direction?: "departure" | "arrival") {
  await connection();
  return cached_getStationBoard(stationId, direction);
}

export async function getVehiclesBySource(sourceId: string) {
  await connection();
  return cached_getVehiclesBySource(sourceId);
}

export async function getLine(sourceId: string, lineId: string) {
  await connection();
  return cached_getLine(sourceId, lineId);
}

/** Static line catalog of one source, without geometry. */
export async function getRoutes(sourceId: string) {
  await connection();
  return cached_getRoutes(sourceId);
}

export async function getHealth() {
  await connection();
  return cached_getHealth();
}

export async function getPlanned() {
  return plannedSources;
}
