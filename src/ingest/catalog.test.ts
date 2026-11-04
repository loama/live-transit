import { describe, expect, test } from "bun:test";
import { applyCatalog, stateFromAlert } from "./catalog";
import type { IngestResult, Alert } from "@/lib/types";

describe("catalog", () => {
  test("applyCatalog enriches vehicles with catalog data", () => {
    const catalog = new Map([
      ["R1", { routeId: "R1", name: "Red", mode: "metro" as const, color: "FF0000" }],
    ]);
    const result: IngestResult = {
      vehicles: [
        { id: "v1", mode: "bus", routeId: "R1", lat: 10, lon: 20 },
        { id: "v2", mode: "bus", routeId: "R2", routeName: "Blue", lat: 10, lon: 20 },
      ],
    };
    const updated = applyCatalog(result, catalog);
    expect(updated.vehicles?.[0].routeName).toBe("Red");
    expect(updated.vehicles?.[0].mode).toBe("metro");
    expect(updated.vehicles?.[0].color).toBe("FF0000");
    expect(updated.vehicles?.[1].routeName).toBe("Blue");
    expect(updated.vehicles?.[1].mode).toBe("bus");
  });

  test("applyCatalog keeps existing non-id routeName", () => {
    const catalog = new Map([
      ["42", { routeId: "42", name: "Express", mode: "bus" as const, color: null }],
    ]);
    const result: IngestResult = {
      vehicles: [
        { id: "v1", mode: "bus", routeId: "42", routeName: "42", lat: 10, lon: 20 },
        { id: "v2", mode: "bus", routeId: "42", routeName: "Express Shuttle", lat: 10, lon: 20 },
      ],
    };
    const updated = applyCatalog(result, catalog);
    expect(updated.vehicles?.[0].routeName).toBe("Express");
    expect(updated.vehicles?.[1].routeName).toBe("Express Shuttle");
  });

  test("applyCatalog synthesizes lines from alerts when no lines provided", () => {
    const catalog = new Map([
      ["R1", { routeId: "R1", name: "Red Line", mode: "metro" as const, color: "FF0000" }],
    ]);
    const result: IngestResult = {
      alerts: [
        { id: "a1", severity: "severe", title: "Delays", modes: ["metro"], routes: ["R1"] },
        { id: "a2", severity: "minor", title: "Minor issue", modes: ["metro"], routes: ["R1"] },
        { id: "a3", severity: "info", title: "Info", modes: ["bus"], routes: ["B1"] },
      ],
    };
    const updated = applyCatalog(result, catalog);
    expect(updated.lines).toBeDefined();
    const r1 = updated.lines!.find((l) => l.lineId === "R1");
    expect(r1?.lineName).toBe("Red Line");
    expect(r1?.mode).toBe("metro");
    expect(r1?.color).toBe("FF0000");
    expect(r1?.status).toBe("major");
    expect(r1?.statusText).toContain("Delays");
  });

  test("applyCatalog synthesizes unknown status when alerts is undefined", () => {
    const catalog = new Map([
      ["R1", { routeId: "R1", name: "Red", mode: "metro" as const, color: null }],
    ]);
    const result: IngestResult = { alerts: undefined };
    const updated = applyCatalog(result, catalog);
    expect(updated.lines).toBeDefined();
    expect(updated.lines!.length).toBeGreaterThan(0);
    const r1 = updated.lines!.find((l) => l.lineId === "R1");
    expect(r1?.status).toBe("unknown");
    expect(r1?.statusText).toBe("No alert feed published");
  });

  test("applyCatalog does not touch lines when connector provides them", () => {
    const catalog = new Map([
      ["R1", { routeId: "R1", name: "Red", mode: "metro" as const, color: null }],
    ]);
    const result: IngestResult = {
      lines: [{ lineId: "R1", lineName: "Custom", mode: "metro", status: "good", statusText: "Good" }],
      alerts: [{ id: "a1", severity: "major", title: "Bad", modes: ["metro"], routes: ["R1"] }],
    };
    const updated = applyCatalog(result, catalog);
    expect(updated.lines).toBeDefined();
    expect(updated.lines!.length).toBe(1);
    expect(updated.lines![0].status).toBe("good");
  });

  test("applyCatalog renames alert route ids to names", () => {
    const catalog = new Map([
      ["R1", { routeId: "R1", name: "Red Line", mode: "metro" as const, color: null }],
    ]);
    const result: IngestResult = {
      alerts: [
        { id: "a1", severity: "major", title: "Delays", modes: ["metro"], routes: ["R1"] },
      ],
    };
    const updated = applyCatalog(result, catalog);
    expect(updated.alerts?.[0].routes).toEqual(["Red Line"]);
  });

  test("applyCatalog sets modes on alerts from catalog", () => {
    const catalog = new Map([
      ["R1", { routeId: "R1", name: "Red", mode: "metro" as const, color: null }],
      ["B1", { routeId: "B1", name: "Blue", mode: "bus" as const, color: null }],
    ]);
    const result: IngestResult = {
      alerts: [
        { id: "a1", severity: "major", title: "Delays", modes: [], routes: ["R1", "B1"] },
      ],
    };
    const updated = applyCatalog(result, catalog);
    expect(updated.alerts?.[0].modes.sort()).toEqual(["bus", "metro"]);
  });

  test("applyCatalog handles empty catalog", () => {
    const result: IngestResult = {
      vehicles: [{ id: "v1", mode: "bus", routeId: "R1", lat: 10, lon: 20 }],
      alerts: [{ id: "a1", severity: "major", title: "Delays", modes: ["bus"], routes: ["R1"] }],
    };
    const original = JSON.stringify(result);
    const updated = applyCatalog(result, new Map());
    expect(JSON.stringify(updated)).toBe(original);
  });

  test("stateFromAlert maps alert severity to line state", () => {
    const severe: Alert = { id: "a1", severity: "severe", title: "No service", modes: ["metro"] };
    const major: Alert = { id: "a2", severity: "major", title: "Delays", modes: ["metro"] };
    const minor: Alert = { id: "a3", severity: "minor", title: "Minor issue", modes: ["metro"] };
    const info: Alert = { id: "a4", severity: "info", title: "Info", modes: ["metro"] };
    expect(stateFromAlert(severe)).toBe("major");
    expect(stateFromAlert(major)).toBe("minor");
    expect(stateFromAlert(minor)).toBeUndefined();
    expect(stateFromAlert(info)).toBeUndefined();
  });
});
