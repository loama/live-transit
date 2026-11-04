import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { fetchText } from "@/lib/http";
import type { Connector, Vehicle } from "@/lib/types";

const URL = "https://maps.amtrak.com/services/MapDataService/trains/getTrainsData";

// Constants shipped in the public Amtrak train map web client, which decrypts this same payload in the browser.
const PUBLIC_KEY = "69af143c-e8cf-47f8-bf09-fc1f61e5cc33";
const SALT = Buffer.from("9a3686ac", "hex");
const IV = Buffer.from("c6eb2f7f5c4740c1a2f708fefd947d39", "hex");
const KEY_SUFFIX_LENGTH = 88;

function decrypt(secret: string, b64: string): string {
  const key = pbkdf2Sync(secret, SALT, 1000, 16, "sha1");
  const d = createDecipheriv("aes-128-cbc", key, IV);
  return Buffer.concat([d.update(Buffer.from(b64, "base64")), d.final()]).toString("utf8");
}

interface Feature {
  geometry?: { coordinates?: [number, number] } | null;
  properties: Record<string, string | null>;
}

export function decryptTrains(payload: string): Feature[] {
  const privateKey = decrypt(PUBLIC_KEY, payload.slice(-KEY_SUFFIX_LENGTH)).split("|")[0];
  return JSON.parse(decrypt(privateKey, payload.slice(0, -KEY_SUFFIX_LENGTH))).features;
}

const COMPASS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const MPH = 0.44704;

/** Minutes late (positive) or early (negative) from Amtrak's "01 HR 18 MI LATE" comments. */
export function parseLateness(s: string | undefined): number | undefined {
  if (!s) return undefined;
  if (/on time/i.test(s)) return 0;
  const m = s.match(/(?:(\d+)\s*HR)?\s*(?:(\d+)\s*MI)?\s*(LATE|EARLY)/i);
  if (!m || (m[1] == null && m[2] == null)) return undefined;
  const mins = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return m[3].toUpperCase() === "LATE" ? mins : -mins;
}

/** Delay at the next station that still has an estimate, falling back to the latest actual. */
export function trainDelayMinutes(props: Record<string, string | null>): number | undefined {
  let lastActual: number | undefined;
  for (let i = 1; i <= 60; i++) {
    const raw = props[`Station${i}`];
    if (!raw) continue;
    const st = JSON.parse(raw) as Record<string, string>;
    const est = parseLateness(st.estdepcmnt ?? st.estarrcmnt);
    if (est !== undefined) return est;
    const post = parseLateness(st.postcmnt);
    if (post !== undefined) lastActual = post;
  }
  return lastActual;
}

export function amtrakVehicles(features: Feature[]): Vehicle[] {
  const out: Vehicle[] = [];
  for (const f of features) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (p.TrainState !== "Active" || !c) continue;
    const delay = trainDelayMinutes(p);
    out.push({
      id: `${p.TrainNum}:${p.OrigSchDep ?? ""}`,
      mode: "rail",
      routeName: p.RouteName ?? undefined,
      tripId: p.TrainNum ?? undefined,
      headsign: p.DestCode ?? undefined,
      lat: c[1],
      lon: c[0],
      bearing: p.Heading ? COMPASS[p.Heading] : undefined,
      speed: p.Velocity ? Number(p.Velocity) * MPH : undefined,
      label: `${p.RouteName} ${p.TrainNum}`,
      delaySeconds: delay === undefined ? undefined : delay * 60,
    });
  }
  return out;
}

export const amtrak: Connector = {
  meta: {
    id: "us-amtrak",
    name: "Amtrak Train Locations",
    operator: "Amtrak",
    country: "us",
    region: "north-america",
    modes: ["rail"],
    kind: "api",
    homepage: "https://www.amtrak.com/track-your-train.html",
    endpoints: [URL],
    attribution: "Train data from the Amtrak track-your-train map.",
    intervalMinutes: 2,
    lat: 39.8283,
    lon: -98.5795,
  },
  async fetch(ctx) {
    return { vehicles: amtrakVehicles(decryptTrains(await fetchText(ctx, URL))) };
  },
};
