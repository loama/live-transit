import { describe, expect, test } from "bun:test";
import { portugueseLineState } from "./shared";
import { runConnector } from "../../../scripts/harness";
import { parseSaoPauloDate, saoPauloArtesp, saoPauloMetro } from "./br-sao-paulo-rail";

describe("br-sao-paulo-rail", () => {
  test("maps Portuguese situations", () => {
    expect(portugueseLineState("Operação Normal")).toBe("good");
    expect(portugueseLineState("Velocidade Reduzida")).toBe("minor");
    expect(portugueseLineState("Operação Parcial")).toBe("major");
    expect(portugueseLineState("Paralisada")).toBe("suspended");
    expect(portugueseLineState("Operação Encerrada")).toBe("closed");
  });

  test("parses America/Sao_Paulo timestamps", () => {
    expect(parseSaoPauloDate("04/11/2026 13:00:40")?.toISOString()).toBe("2026-11-04T16:00:40.000Z");
  });

  test("Direto do Metrô lists Metrô, ViaQuatro and ViaMobilidade lines", async () => {
    const r = await runConnector(saoPauloMetro);
    expect(r.lines!.length).toBeGreaterThanOrEqual(6);
    expect(r.lines!.find((l) => l.lineId === "1")?.lineName).toBe("Linha 1-Azul");
  }, 30_000);

  test("ARTESP lists the delegated commuter lines", async () => {
    const r = await runConnector(saoPauloArtesp);
    expect(r.lines!.map((l) => l.lineId)).toEqual(expect.arrayContaining(["7", "8", "9", "13"]));
  }, 30_000);
});
