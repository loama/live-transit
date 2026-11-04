import { inflateRawSync } from "node:zlib";
import type { ConnectorContext, Mode } from "@/lib/types";

/** GTFS route_type, including the extended codes some feeds use, to our Mode. */
export function modeFromRouteType(t: number): Mode {
  if (t === 0 || (t >= 900 && t < 1000)) return "tram";
  if (t === 1 || (t >= 400 && t < 500)) return "metro";
  if (t === 2 || (t >= 100 && t < 200)) return "rail";
  if (t === 4 || (t >= 1000 && t < 1100) || t === 1200) return "ferry";
  if (t === 5 || t === 6 || t === 7 || t === 1300) return "cable";
  if (t === 3 || (t >= 200 && t < 300) || (t >= 700 && t < 800)) return "bus";
  return "other";
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") (out.push(cur), (cur = ""));
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function routeModesFromCsv(csv: string): Record<string, Mode> {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines[0] ?? "");
  const id = head.indexOf("route_id");
  const type = head.indexOf("route_type");
  const out: Record<string, Mode> = {};
  if (id < 0 || type < 0) return out;
  for (const l of lines.slice(1)) {
    const f = parseCsvLine(l);
    if (f[id]) out[f[id]] = modeFromRouteType(Number(f[type]));
  }
  return out;
}

const range = async (ctx: ConnectorContext, url: string, r: string) =>
  Buffer.from(await (await ctx.fetch(url, { headers: { Range: `bytes=${r}` } })).arrayBuffer());

/** Read only routes.txt out of a remote GTFS zip using HTTP range requests (server must honour Range). */
export async function fetchZipRoutes(ctx: ConnectorContext, url: string): Promise<string> {
  const tail = await range(ctx, url, "-65536");
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("zip end record not found (Range unsupported?)");
  const size = tail.readUInt32LE(eocd + 12);
  const off = tail.readUInt32LE(eocd + 16);
  const cdStart = eocd - size;
  const cd = cdStart >= 0 ? tail.subarray(cdStart, cdStart + size) : await range(ctx, url, `${off}-${off + size - 1}`);
  for (let p = 0; p + 46 <= cd.length; ) {
    const nameLen = cd.readUInt16LE(p + 28);
    const next = p + 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
    if (cd.toString("utf8", p + 46, p + 46 + nameLen) === "routes.txt") {
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20);
      const local = cd.readUInt32LE(p + 42);
      const buf = await range(ctx, url, `${local}-${local + 30 + 1024 + csize - 1}`);
      const start = 30 + buf.readUInt16LE(26) + buf.readUInt16LE(28);
      const data = buf.subarray(start, start + csize);
      return (method === 0 ? data : inflateRawSync(data)).toString("utf8");
    }
    p = next;
  }
  throw new Error("routes.txt not found in zip");
}

const cache = new Map<string, Promise<Record<string, Mode>>>();

/** route_id -> mode from a remote GTFS zip, fetched once per process. Failures are not cached. */
export function cachedZipRouteModes(ctx: ConnectorContext, url: string): Promise<Record<string, Mode>> {
  let p = cache.get(url);
  if (!p) {
    p = fetchZipRoutes(ctx, url).then(routeModesFromCsv);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}
