import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { parseSantiago, santiagoLineState, santiagoMetro } from "./cl-santiago-metro";

describe("cl-santiago-metro", () => {
  test("maps estado codes", () => {
    expect(santiagoLineState("1")).toBe("good");
    expect(santiagoLineState("3")).toBe("suspended");
    expect(santiagoLineState("9")).toBe("unknown");
  });

  test("emits station closures as alerts", () => {
    const r = parseSantiago({
      l2: {
        estado: "1",
        mensaje: "",
        mensaje_app: "Línea disponible",
        estaciones: [{ nombre: "Santa Ana L2", codigo: "AN", estado: "2", descripcion: "Estación Temporalmente Cerrada" }],
      },
    });
    expect(r.lines[0]!.status).toBe("good");
    expect(r.alerts[0]!.id).toBe("station:l2:AN:2");
  });

  test("live feed returns all lines", async () => {
    const r = await runConnector(santiagoMetro);
    expect(r.lines!.length).toBe(7);
    expect(r.lines!.find((l) => l.lineId === "l1")?.lineName).toBe("Línea 1");
  }, 30_000);
});
