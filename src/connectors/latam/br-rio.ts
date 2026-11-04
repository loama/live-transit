import { fetchJson } from "@/lib/http";
import type { Connector, Vehicle } from "@/lib/types";

const MAX_AGE_MS = 10 * 60_000;
const MAX_FUTURE_MS = 2 * 60_000;

interface BrtVehicle {
  codigo: string;
  linha: string;
  latitude: number;
  longitude: number;
  dataHora: number;
  velocidade: number;
  trajeto?: string;
  sentido?: string;
  direcao?: number;
}

export function parseBrt(data: { veiculos: BrtVehicle[] }, now: Date): Vehicle[] {
  const out: Vehicle[] = [];
  for (const v of data.veiculos ?? []) {
    if (!Number.isFinite(v.latitude) || !Number.isFinite(v.longitude) || (v.latitude === 0 && v.longitude === 0)) continue;
    const age = now.getTime() - v.dataHora;
    if (age > MAX_AGE_MS || age < -MAX_FUTURE_MS) continue;
    out.push({
      id: v.codigo,
      mode: "bus",
      routeId: v.linha,
      routeName: v.linha,
      headsign: v.trajeto,
      lat: v.latitude,
      lon: v.longitude,
      bearing: v.direcao,
      speed: v.velocidade != null ? v.velocidade / 3.6 : undefined,
      observedAt: new Date(v.dataHora),
    });
  }
  return out;
}

export const rioBrt: Connector = {
  meta: {
    id: "br-rio-smtr-brt",
    name: "BRT Rio, posição dos veículos",
    operator: "Secretaria Municipal de Transportes do Rio de Janeiro (SMTR)",
    country: "br",
    city: "Rio de Janeiro",
    region: "latam",
    modes: ["bus"],
    kind: "api",
    homepage: "https://dados.mobilidade.rio/",
    endpoints: ["https://dados.mobilidade.rio/gps/brt"],
    license: "Dados abertos da Prefeitura do Rio de Janeiro",
    attribution: "Prefeitura do Rio de Janeiro, SMTR",
    intervalMinutes: 1,
    lat: -22.9068,
    lon: -43.1729,
  },
  async fetch(ctx) {
    const data = await fetchJson<{ veiculos: BrtVehicle[] }>(ctx, "https://dados.mobilidade.rio/gps/brt");
    const vehicles = parseBrt(data, ctx.now);
    if (!vehicles.length) throw new Error("BRT feed returned no fresh vehicles");
    return { vehicles };
  },
};

interface SppoVehicle {
  id_veiculo: string;
  servico: string;
  sentido?: string;
  latitude: number;
  longitude: number;
  velocidade?: number;
  direcao?: number;
  trip_id?: string;
  datetime: string;
}

export function parseSppo(data: SppoVehicle[], now: Date): Vehicle[] {
  const latest = new Map<string, SppoVehicle>();
  for (const v of data) {
    if (!Number.isFinite(v.latitude) || !Number.isFinite(v.longitude) || (v.latitude === 0 && v.longitude === 0)) continue;
    const t = Date.parse(v.datetime);
    if (!Number.isFinite(t) || now.getTime() - t > MAX_AGE_MS) continue;
    const prev = latest.get(v.id_veiculo);
    if (!prev || Date.parse(prev.datetime) < t) latest.set(v.id_veiculo, v);
  }
  return [...latest.values()].map((v) => ({
    id: v.id_veiculo,
    mode: "bus" as const,
    routeId: v.servico,
    routeName: v.servico,
    tripId: v.trip_id,
    lat: v.latitude,
    lon: v.longitude,
    bearing: v.direcao,
    speed: v.velocidade != null ? v.velocidade / 3.6 : undefined,
    observedAt: new Date(v.datetime),
  }));
}

const stamp = (d: Date) => d.toISOString().slice(0, 19).replace("T", "+");

export const rioSppo: Connector = {
  meta: {
    id: "br-rio-smtr-sppo",
    name: "Ônibus municipais do Rio (SPPO), posição dos veículos",
    operator: "Secretaria Municipal de Transportes do Rio de Janeiro (SMTR)",
    country: "br",
    city: "Rio de Janeiro",
    region: "latam",
    modes: ["bus"],
    kind: "api",
    homepage: "https://dados.mobilidade.rio/",
    endpoints: ["https://dados.mobilidade.rio/gps/sppo?dataInicial={start}&dataFinal={end}"],
    license: "Dados abertos da Prefeitura do Rio de Janeiro",
    attribution: "Prefeitura do Rio de Janeiro, SMTR",
    intervalMinutes: 2,
    lat: -22.9068,
    lon: -43.1729,
  },
  async fetch(ctx) {
    const url = `https://dados.mobilidade.rio/gps/sppo?dataInicial=${stamp(new Date(ctx.now.getTime() - 3 * 60_000))}&dataFinal=${stamp(ctx.now)}`;
    const data = await fetchJson<SppoVehicle[]>(ctx, url);
    const vehicles = parseSppo(data, ctx.now);
    if (!vehicles.length) throw new Error("SPPO feed returned no fresh vehicles");
    return { vehicles };
  },
};
