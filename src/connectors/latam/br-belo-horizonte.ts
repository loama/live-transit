import { fetchJson } from "@/lib/http";
import type { Connector, Vehicle } from "@/lib/types";
import { parseLocal } from "./shared";

interface BhRecord {
  EV: string;
  HR: string;
  LT: string;
  LG: string;
  NV: string;
  VL?: string;
  NL?: string;
  DG?: string;
  SV?: string;
}

const num = (s?: string) => {
  if (s == null || s === "") return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function parseBh(data: BhRecord[], now: Date): Vehicle[] {
  const latest = new Map<string, Vehicle>();
  for (const r of data) {
    const m = r.HR?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    const lat = num(r.LT);
    const lon = num(r.LG);
    if (!m || lat == null || lon == null || !r.NV) continue;
    const observedAt = parseLocal(m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, "-03:00");
    if (!observedAt || now.getTime() - observedAt.getTime() > 10 * 60_000) continue;
    const prev = latest.get(r.NV);
    if (prev?.observedAt && prev.observedAt >= observedAt) continue;
    const speed = num(r.VL);
    latest.set(r.NV, {
      id: r.NV,
      mode: "bus",
      routeId: r.NL || undefined,
      lat,
      lon,
      bearing: num(r.DG),
      speed: speed != null ? speed / 3.6 : undefined,
      observedAt,
    });
  }
  return [...latest.values()];
}

export const beloHorizonteBus: Connector = {
  meta: {
    id: "br-belo-horizonte-bhtrans-bus",
    name: "Ônibus de Belo Horizonte, posição em tempo real",
    operator: "Prefeitura de Belo Horizonte (BHTRANS)",
    country: "br",
    city: "Belo Horizonte",
    region: "latam",
    modes: ["bus"],
    kind: "api",
    homepage: "https://dados.pbh.gov.br/dataset/tempo-real-onibus-coordenada-atualizada",
    endpoints: ["https://temporeal.pbh.gov.br/?param=D"],
    license: "Dados abertos da Prefeitura de Belo Horizonte",
    attribution: "Prefeitura de Belo Horizonte",
    intervalMinutes: 2,
    lat: -19.9167,
    lon: -43.9345,
  },
  async fetch(ctx) {
    const data = await fetchJson<BhRecord[]>(ctx, "https://temporeal.pbh.gov.br/?param=D");
    const vehicles = parseBh(data, ctx.now);
    if (!vehicles.length) throw new Error("PBH feed returned no fresh vehicles");
    return { vehicles };
  },
};
