import { POST } from "@/app/api/[transport]/route";

let id = 0;

export async function rpc(method: string, params?: unknown): Promise<any> {
  const req = new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const res = await POST(req);
  const body = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const datas = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
    const msgs = datas.map((d) => JSON.parse(d));
    return msgs.find((m) => m.id === id) ?? msgs[msgs.length - 1];
  }
  return JSON.parse(body);
}

export const INIT_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "bun-test", version: "0" },
};

/** Call a tool and return text, structured content and the error flag. */
export async function callTool(name: string, args: Record<string, unknown>) {
  const msg = await rpc("tools/call", { name, arguments: args });
  if (msg.error) return { error: msg.error as { message: string }, text: "", data: undefined, isError: true };
  const r = msg.result;
  return { error: undefined, text: (r.content?.[0]?.text ?? "") as string, data: r.structuredContent as any, isError: !!r.isError };
}
