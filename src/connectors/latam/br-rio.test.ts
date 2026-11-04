import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { parseBrt, parseSppo, rioBrt, rioSppo } from "./br-rio";

const now = new Date("2026-11-04T16:00:00Z");

describe("br-rio", () => {
  test("drops stale and future-dated BRT vehicles", () => {
    const base = { codigo: "1", linha: "22", latitude: -22.9, longitude: -43.2, velocidade: 36 };
    const v = parseBrt({ veiculos: [{ ...base, dataHora: now.getTime() - 60_000 }, { ...base, codigo: "2", dataHora: now.getTime() - 3_600_000 }, { ...base, codigo: "3", dataHora: now.getTime() + 3 * 3_600_000 }] }, now);
    expect(v).toHaveLength(1);
    expect(v[0]!.speed).toBe(10);
  });

  test("keeps the latest SPPO fix per vehicle", () => {
    const base = { id_veiculo: "B1", servico: "355", latitude: -22.9, longitude: -43.2 };
    const v = parseSppo(
      [
        { ...base, datetime: "2026-11-04T15:58:00Z" },
        { ...base, latitude: -22.8, datetime: "2026-11-04T15:59:00Z" },
      ],
      now,
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.lat).toBe(-22.8);
  });

  test("live BRT positions", async () => {
    const r = await runConnector(rioBrt);
    expect(r.vehicles!.length).toBeGreaterThan(50);
  }, 60_000);

  test("live SPPO positions", async () => {
    const r = await runConnector(rioSppo);
    expect(r.vehicles!.length).toBeGreaterThan(500);
  }, 90_000);
});
