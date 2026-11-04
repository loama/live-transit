import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import { medellinMetro, medellinState, parseMedellin } from "./co-medellin-metro";

describe("co-medellin-metro", () => {
  test("maps estado ids", () => {
    expect(medellinState("2")).toBe("good");
    expect(medellinState("53")).toBe("closed");
    expect(medellinState("41")).toBe("major");
  });

  test("raises an alert for a line operating in parts", () => {
    const r = parseMedellin({
      ok: true,
      data: {
        semaforos: [{ lineaId: "H", estado: "41" }],
        estados: [{ id: "41", text: "Operación por partes - Alta", color: "Amarillo" }],
      },
    });
    expect(r.lines[0]).toMatchObject({ lineId: "H", mode: "cable", status: "major" });
    expect(r.alerts[0]!.id).toBe("H:41");
  });

  test("live feed returns metro, cable, tram and Metroplús lines", async () => {
    const r = await runConnector(medellinMetro);
    expect(r.lines!.length).toBe(12);
    expect(r.lines!.find((l) => l.lineId === "A")?.mode).toBe("metro");
  }, 30_000);
});
