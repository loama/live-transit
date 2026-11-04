import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { parseRed, parseRedDate, santiagoRed } from "./cl-santiago-red";

describe("cl-santiago-red", () => {
  test("parses Spanish dates", () => {
    const d = parseRedDate("02 Nov 2026 - Hasta que terminen las obras");
    expect(d.from?.toISOString().slice(0, 10)).toBe("2026-11-02");
    expect(d.note).toBe("Hasta que terminen las obras");
  });

  test("parses detours and the MetroTren row", () => {
    const html = `<table><thead><tr><th>Fecha</th></tr></thead><tbody><tr><td>07 Abr 2026 - Hasta que terminen</td>
      <td class="recorrido"><a class="bus" href="x">J10</a></td><td>Norte - Sur</td><td>Santiago</td>
      <td class="descripcion">Recorrido J10 con desvío</td>
      <td><a class="ampliar-info" href="https://www.red.cl/estado-del-servicio/desvios/j10-desvio/">m</a></td></tr></tbody></table>
      <table><thead><tr><th>Línea</th></tr></thead><tbody><tr><td><div class="metrotren">MetroTren Nos</div></td><td>Con retrasos</td><td>Falla</td></tr></tbody></table>`;
    const r = parseRed(html);
    expect(r.alerts[0]).toMatchObject({ id: "j10-desvio", routes: ["J10"], effect: "DETOUR" });
    expect(r.lines[0]).toMatchObject({ lineName: "MetroTren Nos", status: "minor" });
  });

  test("live page returns detours and MetroTren status", async () => {
    const r = await runConnector(santiagoRed);
    expect(r.alerts!.length).toBeGreaterThan(5);
    expect(r.lines!.find((l) => l.lineId === "metrotren-nos")).toBeDefined();
  }, 30_000);
});
