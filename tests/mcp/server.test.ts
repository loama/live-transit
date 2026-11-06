import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cleanup, seed, A } from "./fixtures";
import { INIT_PARAMS, callTool, rpc } from "./rpc";

beforeAll(seed);
afterAll(cleanup);

describe("protocol", () => {
  test("initialize returns instructions and tools capability", async () => {
    const m = await rpc("initialize", INIT_PARAMS);
    expect(m.result.serverInfo.name).toBe("live-transit");
    expect(m.result.instructions).toContain("search");
    expect(m.result.capabilities.tools).toBeDefined();
  });

  test("tools/list exposes 10 read-only tools with described fields", async () => {
    const m = await rpc("tools/list", {});
    const tools = m.result.tools as any[];
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["airport", "disruptions", "find_service", "line_status", "list_sources", "network_status", "recent_changes", "search", "vehicles_near", "watch_changes"],
    );
    for (const t of tools) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.openWorldHint).toBe(true);
      for (const [k, p] of Object.entries<any>(t.inputSchema.properties)) expect(`${t.name}.${k}:${p.description}`).not.toContain("undefined");
    }
  });
});

describe("tools/call", () => {
  test("search finds the seeded city and source", async () => {
    const r = await callTool("search", { query: "Testville" });
    expect(r.isError).toBe(false);
    expect(r.text).toContain(A);
    expect(r.data.hits.length).toBeGreaterThan(0);
  });

  test("search with no match is an empty result with a hint, not an error", async () => {
    const r = await callTool("search", { query: "qqqzzzxxx" });
    expect(r.isError).toBeFalsy();
    expect(r.data.count).toBe(0);
    expect(r.text).toContain("list_sources");
  });

  test("network_status by source_id, city and bad input", async () => {
    const byId = await callTool("network_status", { source_id: A });
    expect(byId.text).toContain("Zebra Blue Line");
    expect(byId.text).toContain("min ago");
    expect(byId.data.networks[0].lines).toHaveLength(2);
    const byCity = await callTool("network_status", { city: "Testville" });
    expect(byCity.data.matched).toBe(2);
    expect((await callTool("network_status", {})).isError).toBe(true);
    expect((await callTool("network_status", { source_id: "nope" })).isError).toBe(true);
    expect((await callTool("network_status", { city: "Atlantis" })).text).toContain("search");
  });

  test("disruptions orders by severity and filters", async () => {
    const r = await callTool("disruptions", { country: "zz", min_severity: "major" });
    expect(r.data.alerts.map((a: any) => a.id)).toEqual(["a1"]);
    expect(r.text).toContain("[major]");
    expect((await callTool("disruptions", { country: "zz", mode: "ferry" })).isError).toBeFalsy();
  });

  test("airport shows status and board; unknown iata suggests search", async () => {
    const r = await callTool("airport", { iata: "zzt" });
    expect(r.text).toContain("ZQ 777");
    expect(r.text).toContain("Fog");
    expect(r.data.board).toHaveLength(2);
    expect((await callTool("airport", { iata: "zzt", direction: "arrival" })).data.board).toHaveLength(1);
    const bad = await callTool("airport", { iata: "QQQ" });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("search");
  });

  test("find_service ignores spacing and case", async () => {
    const r = await callTool("find_service", { number: "zq777" });
    expect(r.data.services).toHaveLength(1);
    expect((await callTool("find_service", { number: "XX 1" })).isError).toBeFalsy();
  });

  test("vehicles_near sorts by distance and respects radius", async () => {
    const r = await callTool("vehicles_near", { lat: 10, lon: 20, radius_km: 25 });
    expect(r.data.vehicles.map((v: any) => v.id)).toEqual(["v1", "v2"]);
    const tight = await callTool("vehicles_near", { lat: 10, lon: 20, radius_km: 1 });
    expect(tight.data.vehicles).toHaveLength(1);
    expect((await callTool("vehicles_near", { lat: 10, lon: 20, radius_km: 99 })).isError).toBe(true);
  });

  test("recent_changes reports the transition", async () => {
    const r = await callTool("recent_changes", { source_id: A, since_minutes: 60 });
    expect(r.data.changes.some((c: any) => c.subjectName === "Zebra Blue Line" && c.toStatus === "major")).toBe(true);
    expect(r.text).toContain("good -> major");
  });

  test("list_sources reports health and filters", async () => {
    const r = await callTool("list_sources", { country: "zz" });
    expect(r.data.total).toBe(2);
    expect(r.data.health.live).toBe(2);
    expect((await callTool("list_sources", { country: "zz", mode: "ferry" })).isError).toBeFalsy();
  });

  test("line_status shows vehicles, alerts and history; resolves by name", async () => {
    const byId = await callTool("line_status", { source_id: A, line: "b" });
    expect(byId.text).toContain("Zebra Blue Line");
    expect(byId.text).toContain("major");
    expect(byId.text).toContain("good -> major");
    expect(byId.data.vehiclesCount).toBeGreaterThanOrEqual(0);
    const byName = await callTool("line_status", { source_id: A, line: "zebra blue line" });
    expect(byName.data.lineId).toBe("b");
    expect((await callTool("line_status", { source_id: "nope", line: "x" })).isError).toBe(true);
    expect((await callTool("line_status", { source_id: A, line: "nope" })).isError).toBe(true);
  });
});
