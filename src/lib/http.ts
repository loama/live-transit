import type { ConnectorContext } from "./types";

export const USER_AGENT =
  "LiveTransitBot/1.0 (+https://livetransit.vercel.app/about; open transit status aggregator)";

const DEFAULT_TIMEOUT_MS = 20_000;

export function makeContext(signal: AbortSignal, now = new Date()): ConnectorContext {
  return {
    signal,
    now,
    fetch: (url, init) => politeFetch(url, init, signal),
  };
}

export async function politeFetch(
  url: string,
  init: RequestInit = {},
  parent?: AbortSignal,
  attempts = 2,
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    const signal = parent ? AbortSignal.any([parent, timeout]) : timeout;
    try {
      const res = await fetch(url, {
        ...init,
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
          ...(init.headers ?? {}),
        },
      });
      if (res.status >= 500 && i < attempts - 1) {
        lastError = new Error(`HTTP ${res.status} from ${url}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return res;
    } catch (err) {
      lastError = err;
      if (parent?.aborted) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T = unknown>(ctx: ConnectorContext, url: string, init?: RequestInit): Promise<T> {
  const res = await ctx.fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  return (await res.json()) as T;
}

export async function fetchText(ctx: ConnectorContext, url: string, init?: RequestInit): Promise<string> {
  const res = await ctx.fetch(url, init);
  return res.text();
}

export async function fetchBuffer(ctx: ConnectorContext, url: string, init?: RequestInit): Promise<Uint8Array> {
  const res = await ctx.fetch(url, init);
  return new Uint8Array(await res.arrayBuffer());
}
