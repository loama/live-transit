import { describe, expect, test } from "bun:test";
import { runConnector } from "../../../scripts/harness";
import type { Alert } from "@/lib/types";
import { mbta, stopLevelClosure, tameAlert } from "./mbta";

describe("mbta", () => {
  test("live", async () => {
    const r = await runConnector(mbta);
    expect(r.lines!.find((l) => l.lineId === "Red")?.lineName).toBe("Red Line");
    expect(r.vehicles!.length).toBeGreaterThan(50);
    expect(r.vehicles!.some((v) => v.mode === "metro")).toBe(true);
  }, 30_000);

  const base: Alert = { id: "1", severity: "severe", title: "t", modes: ["tram"] };
  test("stop closures do not suspend the line and stay minor", () => {
    const a = { ...base, effect: "NO_SERVICE", stops: ["place-hwsst"] };
    expect(stopLevelClosure(a)).toBe(true);
    expect(tameAlert(a).severity).toBe("minor");
    expect(stopLevelClosure({ ...base, effect: "NO_SERVICE" })).toBe(false);
    expect(tameAlert({ ...base, effect: "NO_SERVICE" }).severity).toBe("severe");
  });

  test("non-service effects are capped below major", () => {
    expect(tameAlert({ ...base, effect: "OTHER_EFFECT" }).severity).toBe("minor");
    expect(tameAlert({ ...base, effect: "DETOUR" }).severity).toBe("severe");
  });
});
