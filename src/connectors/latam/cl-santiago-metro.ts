import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus } from "@/lib/types";

interface Station {
  nombre: string;
  codigo: string;
  estado: string;
  descripcion: string;
  mensaje?: string;
}
interface Line {
  estado: string;
  mensaje: string;
  mensaje_app: string;
  estaciones: Station[];
}

const LINES: Record<string, { name: string; color: string }> = {
  l1: { name: "Línea 1", color: "E3000F" },
  l2: { name: "Línea 2", color: "FFC20E" },
  l3: { name: "Línea 3", color: "6D3A10" },
  l4: { name: "Línea 4", color: "1D3F94" },
  l4a: { name: "Línea 4A", color: "0099D8" },
  l5: { name: "Línea 5", color: "00A651" },
  l6: { name: "Línea 6", color: "A64A97" },
};

export function santiagoLineState(estado: string): LineState {
  if (estado === "1") return "good";
  if (estado === "2") return "minor";
  if (estado === "3") return "suspended";
  return "unknown";
}

export function parseSantiago(data: Record<string, Line>): { lines: LineStatus[]; alerts: Alert[] } {
  const lines: LineStatus[] = [];
  const alerts: Alert[] = [];
  for (const [key, l] of Object.entries(data)) {
    const meta = LINES[key];
    if (!meta) continue;
    const status = santiagoLineState(l.estado);
    lines.push({
      lineId: key,
      lineName: meta.name,
      mode: "metro",
      color: meta.color,
      status,
      statusText: l.mensaje_app || l.mensaje,
    });
    if (status !== "good") {
      alerts.push({
        id: `line:${key}:${l.estado}`,
        severity: status === "suspended" ? "severe" : "minor",
        effect: status === "suspended" ? "NO_SERVICE" : "MODIFIED_SERVICE",
        title: l.mensaje || `${meta.name}: ${l.mensaje_app}`,
        modes: ["metro"],
        routes: [meta.name],
      });
    }
    for (const s of l.estaciones ?? []) {
      if (s.estado === "1") continue;
      alerts.push({
        id: `station:${key}:${s.codigo}:${s.estado}`,
        severity: "minor",
        effect: "NO_SERVICE",
        title: `${s.nombre}: ${s.descripcion}`,
        description: s.mensaje || undefined,
        modes: ["metro"],
        routes: [meta.name],
        stops: [s.nombre],
      });
    }
  }
  return { lines, alerts };
}

export const santiagoMetro: Connector = {
  meta: {
    id: "cl-santiago-metro",
    name: "Metro de Santiago, estado de la red",
    operator: "Metro S.A.",
    country: "cl",
    city: "Santiago",
    region: "latam",
    modes: ["metro"],
    kind: "api",
    homepage: "https://www.metro.cl/",
    endpoints: ["https://www.metro.cl/api/estadoRedDetalle.php"],
    attribution: "Metro S.A.",
    intervalMinutes: 1,
    lat: -33.4489,
    lon: -70.6693,
  },
  async fetch(ctx) {
    const data = await fetchJson<Record<string, Line>>(ctx, "https://www.metro.cl/api/estadoRedDetalle.php");
    const r = parseSantiago(data);
    if (!r.lines.length) throw new Error("metro.cl returned no lines");
    return r;
  },
};
