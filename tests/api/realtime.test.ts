import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db/client";
import { persistResult, upsertSources } from "@/db/persist";
import { feedSince, latestEventId } from "@/db/queries";
import { assertPublicUrl, sign } from "@/ingest/webhooks";
import { GET as stream } from "@/app/api/v1/stream/route";
import { POST as createWebhook } from "@/app/api/v1/webhooks/route";
import { callTool } from "../mcp/rpc";
import { cleanup, req } from "./fixtures";

const SRC = "test-api-realtime";
const alert = (id: string, title: string) => ({ id, severity: "major" as const, title, modes: ["bus" as const] });

beforeAll(async () => {
  await cleanup();
  await upsertSources(db(), [{
    id: SRC, name: "Realtime Test", operator: "Op", country: "zz", region: "europe", modes: ["bus"], kind: "api",
    homepage: "https://example.org", endpoints: [], intervalMinutes: 1,
  }]);
});
afterAll(cleanup);

describe("change feed", () => {
  test("alerts opening and resolving become events after the first ingest", async () => {
    const start = await latestEventId();
    await persistResult(db(), SRC, { alerts: [alert("a1", "Baseline alert")] });
    expect(await feedSince({ after: start, sourceIds: [SRC] })).toEqual([]);
    await persistResult(db(), SRC, { alerts: [alert("a1", "Baseline alert"), alert("a2", "Quokka bridge closed")] });
    await persistResult(db(), SRC, { alerts: [alert("a2", "Quokka bridge closed")] });
    const events = await feedSince({ after: start, sourceIds: [SRC] });
    expect(events.map((e) => [e.subject, e.subjectId, e.to])).toEqual([["alert", "a2", "opened"], ["alert", "a1", "resolved"]]);
    expect(events[0]).toMatchObject({ severity: "major", subjectName: "Quokka bridge closed", country: "zz" });
    expect(BigInt(events[1].id)).toBeGreaterThan(BigInt(events[0].id));
    expect(await feedSince({ after: start, sourceIds: [SRC], subjects: ["line"] })).toEqual([]);
  });

  test("the stream replays events after Last-Event-ID", async () => {
    const [first] = await feedSince({ sourceIds: [SRC], limit: 2 });
    const ac = new AbortController();
    const r = await stream(new Request(`http://localhost/api/v1/stream?sourceId=${SRC}`, { headers: { "Last-Event-ID": String(Number(first.id) - 1) }, signal: ac.signal }));
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const reader = r.body!.getReader();
    let text = "";
    while (!text.includes("Quokka")) text += new TextDecoder().decode((await reader.read()).value);
    ac.abort();
    expect(text).toContain(`id: ${first.id}`);
    expect(text).toContain("event: change");
  });

  test("stream rejects an unknown kind", async () => {
    expect((await stream(req("/api/v1/stream?subject=weather"))).status).toBe(400);
  });

  test("watch_changes returns new events after a cursor", async () => {
    const r = await callTool("watch_changes", { source_id: SRC, cursor: "0", wait_seconds: 0 });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("Quokka bridge closed");
    expect(Number(r.data.cursor)).toBeGreaterThan(0);
  });
});

describe("webhooks", () => {
  test("only public https URLs are accepted", async () => {
    for (const url of ["http://example.org/hook", "https://127.0.0.1/hook", "https://10.1.2.3/x", "https://[::1]/x", "https://169.254.169.254/latest", "https://user:pw@example.org/x"]) {
      await expect(assertPublicUrl(url)).rejects.toThrow();
    }
    expect((await assertPublicUrl("https://93.184.215.14/hook")).hostname).toBe("93.184.215.14");
  });

  test("signatures are HMAC-SHA256 over the timestamp and body", () => {
    expect(sign("secret", '{"a":1}', 1700000000)).toBe("t=1700000000,v1=" + new Bun.CryptoHasher("sha256", "secret").update('1700000000.{"a":1}').digest("hex"));
  });

  test("subscribing a private URL is refused before any request is made", async () => {
    const r = await createWebhook(new Request("http://localhost/api/v1/webhooks", { method: "POST", body: JSON.stringify({ url: "https://localhost/hook" }) }));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: { message: string } }).error.message).toContain("public");
  });
});
