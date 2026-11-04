import type { Mode, Vehicle } from "@/lib/types";

/**
 * Parse the "gps.txt" CSV used by Tallinn and Vilnius:
 * type,line,lon*1e6,lat*1e6,speed km/h,bearing,vehicle id,...,destination
 */
export function parseGpsTxt(text: string, modeOf: (type: string) => Mode): Vehicle[] {
  const out: Vehicle[] = [];
  for (const row of text.split(/\r?\n/)) {
    const f = row.split(",");
    if (f.length < 7) continue;
    const lon = Number(f[2]) / 1e6;
    const lat = Number(f[3]) / 1e6;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const speed = f[4] ? Number(f[4]) / 3.6 : undefined;
    out.push({
      id: `${f[0]}:${f[6]}`,
      mode: modeOf(f[0]),
      routeId: f[1],
      routeName: f[1],
      headsign: f[9]?.trim() || undefined,
      lat,
      lon,
      bearing: f[5] ? Number(f[5]) : undefined,
      speed: speed != null && Number.isFinite(speed) ? speed : undefined,
      label: f[6],
    });
  }
  return out;
}
