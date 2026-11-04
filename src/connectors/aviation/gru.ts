import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, clockNear, delayBetween, delayedOrOn, departureId, uniqueDepartures, type AirportInfo } from "./fids";

const BASE = "https://www.gru.com.br/pt/Voos.ashx?rota=api/voos";

export const GRU: AirportInfo = { iata: "GRU", name: "Aeroporto Internacional de Guarulhos", city: "São Paulo", country: "br", tz: "America/Sao_Paulo", lat: -23.4356, lon: -46.4731 };

const AIRLINES: Record<string, string> = {
  TAM: "LATAM Airlines Brasil", LAN: "LATAM Airlines", GLO: "GOL", AZU: "Azul", ARG: "Aerolíneas Argentinas", AVA: "Avianca", CMP: "Copa Airlines",
  SKU: "SKY Airline", UAL: "United Airlines", AAL: "American Airlines", DAL: "Delta Air Lines", AFR: "Air France", KLM: "KLM", BAW: "British Airways",
  DLH: "Lufthansa", IBE: "Iberia", TAP: "TAP Air Portugal", QTR: "Qatar Airways", UAE: "Emirates", ETH: "Ethiopian Airlines", SWR: "Swiss", ITY: "ITA Airways",
  AMX: "Aeroméxico", ACA: "Air Canada", PTB: "Passaredo", VOE: "Voepass", TTL: "Total Linhas Aéreas", JAT: "JetSMART", JES: "JetSMART", BOV: "Boliviana de Aviación",
  AEA: "Air Europa", TAR: "Tunisair", RAM: "Royal Air Maroc", SAA: "South African Airways", TUR: "Turkish Airlines", THY: "Turkish Airlines", LAP: "Paraguaya", PAL: "Pal Airlines",
};

export interface GruFlight {
  numerosVoo: string[];
  ciaAerea: string;
  tipo: "Embarque" | "Desembarque";
  portao: string | null;
  origemDestino: string;
  horario: string;
  horarioConfirmado: string | null;
  observacaoEn: string | null;
  dataCompleta: string;
}

export function mapGruStatus(text: string | null, arrival: boolean, delay: number | undefined): DepartureState {
  const t = (text ?? "").toLowerCase();
  if (t.startsWith("cancel")) return "cancelled";
  if (t.startsWith("delayed")) return "delayed";
  if (arrival) {
    if (t.startsWith("disembarking")) return "arrived";
    return delayedOrOn(delay);
  }
  if (t === "leaving") return "departed";
  if (t === "proceed to gate" || t === "now boarding" || t === "last call" || t === "flight closed") return "boarding";
  return delayedOrOn(delay);
}

export function mapGruFlight(f: GruFlight): Departure | undefined {
  const scheduledAt = new Date(f.dataCompleta);
  const number = f.numerosVoo?.[0];
  if (!number || Number.isNaN(scheduledAt.getTime())) return undefined;
  const arrival = f.tipo === "Desembarque";
  const direction = arrival ? "arrival" : "departure";
  const estimatedAt = f.horarioConfirmado ? clockNear(f.horarioConfirmado, scheduledAt, GRU.tz) : undefined;
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapGruStatus(f.observacaoEn, arrival, delayMinutes);
  const service = `${f.ciaAerea}${number}`;
  return {
    id: departureId(GRU.iata, direction, service, scheduledAt),
    stationId: GRU.iata,
    stationName: GRU.name,
    direction,
    mode: "air",
    service,
    carrier: AIRLINES[f.ciaAerea] ?? f.ciaAerea,
    counterpart: f.origemDestino,
    scheduledAt,
    estimatedAt,
    platform: !arrival && f.portao ? f.portao : undefined,
    status,
    statusText: f.observacaoEn ?? undefined,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

export const gru: Connector = {
  meta: {
    id: "br-saopaulo-gru-airport",
    name: "São Paulo Guarulhos Airport flights",
    operator: "GRU Airport",
    country: "br",
    city: "São Paulo",
    region: "latam",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.gru.com.br/pt/passageiro/voos",
    endpoints: [`${BASE}/partidas`, `${BASE}/chegadas`],
    attribution: "Flight information from GRU Airport",
    intervalMinutes: 5,
    lat: -23.4356,
    lon: -46.4731,
  },
  async fetch(ctx) {
    const [dep, arr] = await Promise.all([fetchJson<GruFlight[]>(ctx, `${BASE}/partidas`), fetchJson<GruFlight[]>(ctx, `${BASE}/chegadas`)]);
    const to = ctx.now.getTime() + 12 * 3_600_000;
    const departures = uniqueDepartures(
      [...dep, ...arr].map(mapGruFlight).filter((d): d is Departure => !!d && d.scheduledAt.getTime() <= to),
    );
    return { departures, stations: [airportStatus(GRU, departures, ctx.now)] };
  },
};
