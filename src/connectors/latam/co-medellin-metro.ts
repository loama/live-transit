import { fetchJson } from "@/lib/http";
import type { Alert, Connector, LineState, LineStatus, Mode, Severity } from "@/lib/types";

interface Semaforos {
  ok: boolean;
  data: {
    semaforos: { lineaId: string; estado: string }[];
    estados: { id: string; text: string; color: string }[];
  };
}

const LINES: Record<string, { name: string; mode: Mode; color: string; route: string }> = {
  A: { name: "Línea A", mode: "metro", color: "215CA0", route: "Niquía - La Estrella" },
  B: { name: "Línea B", mode: "metro", color: "EB8530", route: "San Antonio - San Javier" },
  T: { name: "Tranvía de Ayacucho", mode: "tram", color: "44A925", route: "San Antonio - Oriente" },
  H: { name: "Metrocable Línea H", mode: "cable", color: "E61771", route: "Oriente - Villa Sierra" },
  J: { name: "Metrocable Línea J", mode: "cable", color: "F7C439", route: "San Javier - La Aurora" },
  K: { name: "Metrocable Línea K", mode: "cable", color: "B9CF47", route: "Acevedo - Santo Domingo" },
  L: { name: "Metrocable Línea L", mode: "cable", color: "8E6329", route: "Santo Domingo - Arví" },
  M: { name: "Metrocable Línea M", mode: "cable", color: "8322A7", route: "Miraflores - Trece de Noviembre" },
  P: { name: "Metrocable Línea P", mode: "cable", color: "B01330", route: "Acevedo - El Progreso" },
  O: { name: "Metroplús Línea O", mode: "bus", color: "E3807B", route: "Caribe - La Palma" },
  "1": { name: "Metroplús Línea 1", mode: "bus", color: "11707C", route: "U. de M. - Parque Aranjuez" },
  "2": { name: "Metroplús Línea 2", mode: "bus", color: "64A9B0", route: "U. de M. - Parque Aranjuez" },
};

// Ids published in the "estados" table of the semaforos endpoint.
export function medellinState(id: string): LineState {
  switch (id) {
    case "2":
      return "good";
    case "3":
    case "53":
    case "58":
      return "closed";
    case "41":
      return "major";
    case "54":
    case "59":
      return "minor";
    default:
      return "unknown";
  }
}

export function parseMedellin(res: Semaforos): { lines: LineStatus[]; alerts: Alert[] } {
  const texts = new Map(res.data.estados.map((e) => [e.id, e.text]));
  const lines: LineStatus[] = [];
  const alerts: Alert[] = [];
  for (const s of res.data.semaforos) {
    const meta = LINES[s.lineaId];
    if (!meta) continue;
    const status = medellinState(s.estado);
    const text = texts.get(s.estado) ?? s.estado;
    lines.push({ lineId: s.lineaId, lineName: meta.name, mode: meta.mode, color: meta.color, status, statusText: text });
    if (status === "good" || s.estado === "1") continue;
    const severity: Severity = status === "closed" ? "severe" : status === "major" ? "major" : "minor";
    alerts.push({
      id: `${s.lineaId}:${s.estado}`,
      severity,
      effect: status === "closed" ? "NO_SERVICE" : "REDUCED_SERVICE",
      title: `${meta.name} (${meta.route}): ${text}`,
      modes: [meta.mode],
      routes: [meta.name],
    });
  }
  return { lines, alerts };
}

export const medellinMetro: Connector = {
  meta: {
    id: "co-medellin-metro",
    name: "Metro de Medellín, Metrocable, Tranvía y Metroplús",
    operator: "Metro de Medellín",
    country: "co",
    city: "Medellín",
    region: "latam",
    modes: ["metro", "tram", "cable", "bus"],
    kind: "api",
    homepage: "https://www.metrodemedellin.gov.co/",
    endpoints: ["https://www.metrodemedellin.gov.co/_hcms/api/semaforos"],
    attribution: "Metro de Medellín",
    intervalMinutes: 1,
    lat: 6.2442,
    lon: -75.5812,
  },
  async fetch(ctx) {
    const res = await fetchJson<Semaforos>(ctx, "https://www.metrodemedellin.gov.co/_hcms/api/semaforos");
    if (!res.ok || !res.data?.semaforos?.length) throw new Error("semaforos returned no lines");
    return parseMedellin(res);
  },
};
