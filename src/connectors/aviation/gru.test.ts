import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { gru, mapGruFlight } from "./gru";

const base = { ciaAerea: "TAM", numerosVoo: ["3612", "7394"], origemDestino: "São Luís", portao: "222", dataCompleta: "2026-11-04T12:45:00-03:00" };

describe("gru", () => {
  test("keeps the operating flight and computes delay from the confirmed time", () => {
    const d = mapGruFlight({ ...base, tipo: "Embarque", horario: "12:45", horarioConfirmado: "13:10", observacaoEn: "Check-in E" })!;
    expect(d.id).toBe("GRU:departure:TAM3612:2026-11-04T15:45:00.000Z");
    expect(d.estimatedAt?.toISOString()).toBe("2026-11-04T16:10:00.000Z");
    expect(d.delayMinutes).toBe(25);
    expect(d.status).toBe("delayed");
    expect(d.carrier).toBe("LATAM Airlines Brasil");
  });

  test("handles midnight wrap, cancellations and arrivals", () => {
    const wrap = mapGruFlight({ ...base, tipo: "Desembarque", horario: "23:55", horarioConfirmado: "00:10", observacaoEn: "Estimated", dataCompleta: "2026-11-04T23:55:00-03:00" })!;
    expect(wrap.delayMinutes).toBe(15);
    expect(wrap.platform).toBeUndefined();
    expect(mapGruFlight({ ...base, tipo: "Embarque", horario: "12:45", horarioConfirmado: null, observacaoEn: "Cancelled / Report to the Airline" })!.status).toBe("cancelled");
    expect(mapGruFlight({ ...base, tipo: "Desembarque", horario: "12:45", horarioConfirmado: "12:40", observacaoEn: "Disembarking - East" })!.status).toBe("arrived");
  });

  test("live board", async () => {
    const r = await runConnector(gru);
    expect(r.departures!.length).toBeGreaterThan(200);
    expect(r.stations![0].stationId).toBe("GRU");
  }, 60_000);
});
