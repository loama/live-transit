import { fetchJson } from "@/lib/http";
import type { Connector, Departure, DepartureState } from "@/lib/types";
import { airportStatus, delayBetween, delayedOrOn, departureId, inWindow, parseLocal, titleCase, uniqueDepartures, type AirportInfo } from "./fids";

const URL = "https://data.gov.il/api/3/action/datastore_search?resource_id=e83f763b-b7d7-479e-b172-ae981ddc6de5&limit=32000";

export const TLV: AirportInfo = { iata: "TLV", name: "Ben Gurion Airport", city: "Tel Aviv", country: "il", tz: "Asia/Jerusalem", lat: 32.0114, lon: 34.8867 };

export interface TlvRecord {
  CHOPER: string;
  CHFLTN: string;
  CHOPERD?: string;
  CHSTOL: string;
  CHPTOL?: string;
  CHAORD: "A" | "D";
  CHLOC1: string;
  CHLOC1D?: string;
  CHRMINE?: string;
}

export function mapTlvStatus(status: string | undefined, delay: number | undefined): DepartureState {
  switch ((status ?? "").toUpperCase()) {
    case "CANCELED":
    case "CANCELLED":
      return "cancelled";
    case "DEPARTED":
      return "departed";
    case "LANDED":
      return "landed";
    case "DELAYED":
      return "delayed";
    default:
      return delayedOrOn(delay);
  }
}

export function mapTlvRecord(r: TlvRecord): Departure | undefined {
  const scheduledAt = parseLocal(r.CHSTOL, TLV.tz);
  if (!scheduledAt || !r.CHOPER || !r.CHFLTN) return undefined;
  const arrival = r.CHAORD === "A";
  const direction = arrival ? "arrival" : "departure";
  const estimatedAt = parseLocal(r.CHPTOL, TLV.tz);
  const delayMinutes = delayBetween(scheduledAt, estimatedAt);
  const status = mapTlvStatus(r.CHRMINE, delayMinutes);
  const service = `${r.CHOPER}${r.CHFLTN}`;
  return {
    id: departureId(TLV.iata, direction, service, scheduledAt),
    stationId: TLV.iata,
    stationName: TLV.name,
    direction,
    mode: "air",
    service,
    carrier: titleCase(r.CHOPERD?.replace(/\s+/g, " ").trim()),
    counterpart: titleCase(r.CHLOC1D) ?? r.CHLOC1,
    scheduledAt,
    estimatedAt: status === "cancelled" ? undefined : estimatedAt,
    status,
    statusText: r.CHRMINE,
    delayMinutes: status === "cancelled" ? undefined : delayMinutes,
  };
}

export const tlv: Connector = {
  meta: {
    id: "il-telaviv-tlv-airport",
    name: "Ben Gurion Airport flights",
    operator: "Israel Airports Authority",
    country: "il",
    city: "Tel Aviv",
    region: "middle-east",
    modes: ["air"],
    kind: "fids",
    homepage: "https://www.iaa.gov.il/en/airports/ben-gurion/flight-board/",
    endpoints: [URL],
    license: "Israel open data (data.gov.il)",
    attribution: "Israel Airports Authority via data.gov.il",
    intervalMinutes: 5,
    lat: 32.0114,
    lon: 34.8867,
  },
  async fetch(ctx) {
    const res = await fetchJson<{ success?: boolean; result?: { records?: TlvRecord[] } }>(ctx, URL);
    const records = res.result?.records;
    if (!records) throw new Error("data.gov.il flights: unexpected response");
    const departures = uniqueDepartures(inWindow(records.map(mapTlvRecord).filter((d): d is Departure => !!d), ctx.now));
    return { departures, stations: [airportStatus(TLV, departures, ctx.now)] };
  },
};
