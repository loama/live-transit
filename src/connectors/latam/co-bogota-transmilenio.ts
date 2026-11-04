import { alertsFromFeed, decodeFeed, vehiclesFromFeed } from "@/lib/gtfs-rt";
import { fetchBuffer } from "@/lib/http";
import type { Alert, Connector } from "@/lib/types";

const BASE = "https://gtfs.transmilenio.gov.co";
const STALE_MS = 30 * 60_000;

/** The feed only carries numeric route ids; the alert text names the line, e.g. "Novedad en la operacion en linea DK211\...". */
export function withLineNames(alerts: Alert[]): Alert[] {
  return alerts.map((a) => {
    const line = a.description?.match(/en l[ií]nea\s+([A-Z0-9-]+)/i)?.[1];
    return line ? { ...a, title: `${line}: ${a.title}`, routes: [line] } : a;
  });
}

export const transmilenio: Connector = {
  meta: {
    id: "co-bogota-transmilenio",
    name: "TransMilenio y SITP",
    operator: "TransMilenio S.A.",
    country: "co",
    city: "Bogotá",
    region: "latam",
    modes: ["bus"],
    kind: "gtfs-rt",
    homepage: "https://www.transmilenio.gov.co/",
    endpoints: [`${BASE}/alerts.pb`, `${BASE}/positions.pb`],
    intervalMinutes: 2,
    lat: 4.711,
    lon: -74.0721,
  },
  async fetch(ctx) {
    const [a, v] = await Promise.all([fetchBuffer(ctx, `${BASE}/alerts.pb`), fetchBuffer(ctx, `${BASE}/positions.pb`)]);
    const opts = { defaultMode: "bus" as const, languages: ["es", "es-CO", ""] };
    const cutoff = ctx.now.getTime() - STALE_MS;
    return {
      alerts: withLineNames(alertsFromFeed(decodeFeed(a), opts, ctx.now)),
      vehicles: vehiclesFromFeed(decodeFeed(v), opts).filter((x) => !x.observedAt || x.observedAt.getTime() >= cutoff),
    };
  },
};
