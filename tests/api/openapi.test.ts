import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { GET as openapi, OPTIONS } from "@/app/api/v1/openapi.json/route";
import { GET as llms } from "@/app/llms.txt/route";
import { req } from "./fixtures";

const ROOT = join(import.meta.dir, "../../src/app/api/v1");

function routes(dir = ROOT, prefix = "/api/v1"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    const seg = name.replace(/\[(\w+)\]/g, "{$1}");
    if (readdirSync(p).includes("route.ts")) out.push(`${prefix}/${seg}`);
    out.push(...routes(p, `${prefix}/${seg}`));
  }
  return out;
}

const doc = (await (await openapi(req("/api/v1/openapi.json"))).json()) as any;

describe("openapi", () => {
  test("is 3.1 and lists every route", () => {
    expect(doc.openapi).toBe("3.1.0");
    const found = routes();
    expect(found.length).toBeGreaterThanOrEqual(15);
    for (const r of found) expect(doc.paths[r], r).toBeDefined();
    for (const p of Object.keys(doc.paths)) expect(found, p).toContain(p);
  });

  test("operations have descriptions, examples and resolvable refs", () => {
    const ids = new Set<string>();
    for (const [path, item] of Object.entries<any>(doc.paths)) {
      for (const [method, op] of Object.entries<any>(item)) {
        const where = `${method.toUpperCase()} ${path}`;
        expect(op.description, where).toBeTruthy();
        expect(ids.has(op.operationId), where).toBe(false);
        ids.add(op.operationId);
        const ok = op.responses["200"] ?? op.responses["201"] ?? op.responses["204"];
        expect(ok, where).toBeDefined();
        if (ok.content) expect(Object.values<any>(ok.content).some((c) => c.example !== undefined), where).toBe(true);
        const templ = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const declared = (op.parameters ?? []).filter((p: any) => p.in === "path").map((p: any) => p.name);
        expect(declared.sort(), where).toEqual(templ.sort());
      }
    }
    const refs = [...JSON.stringify(doc).matchAll(/#\/components\/(\w+)\/(\w+)/g)];
    for (const [, kind, name] of refs) expect(doc.components[kind][name], `${kind}/${name}`).toBeDefined();
  });

  test("headers", async () => {
    const r = await openapi(req("/x"));
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(OPTIONS().status).toBe(204);
  });
});

describe("llms.txt", () => {
  test("mentions endpoints and MCP tools", async () => {
    const r = llms();
    expect(r.headers.get("Content-Type")).toContain("text/plain");
    const t = await r.text();
    for (const s of ["/api/v1/overview", "/api/mcp", "find_service", "vehicles_near", "live", "stale", "failing", "pending"]) expect(t).toContain(s);
  });
});
