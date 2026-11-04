import { z } from "zod";
import { MODES } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const CACHE_DEFAULT = "public, s-maxage=20, stale-while-revalidate=60";
const CACHE_VEHICLES = "public, s-maxage=10, stale-while-revalidate=60";

export interface Meta {
  count?: number;
  nextCursor?: string;
  attribution?: string[];
}

export function json(body: unknown, status = 200, cache: string | null = CACHE_DEFAULT): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS,
      ...(cache ? { "Cache-Control": cache } : { "Cache-Control": "no-store" }),
    },
  });
}

/** Success envelope: `{ data, meta: { generatedAt, count, nextCursor?, attribution? } }`. */
export function ok<T>(data: T, meta: Meta = {}, opts: { vehicles?: boolean } = {}): Response {
  const count = meta.count ?? (Array.isArray(data) ? data.length : 1);
  const m = {
    generatedAt: new Date().toISOString(),
    count,
    ...(meta.nextCursor ? { nextCursor: meta.nextCursor } : {}),
    ...(meta.attribution?.length ? { attribution: meta.attribution } : {}),
  };
  return json({ data, meta: m }, 200, opts.vehicles ? CACHE_VEHICLES : CACHE_DEFAULT);
}

export function errorResponse(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status, status === 404 ? CACHE_DEFAULT : null);
}

export const notFound = (message: string) => errorResponse(404, "not_found", message);

export function options(): Response {
  return new Response(null, { status: 204, headers: { ...CORS, "Cache-Control": "public, max-age=86400" } });
}

type Ctx = { params: Promise<Record<string, string | string[]>> };

/** Wraps a handler: ApiError becomes its JSON response, anything else a generic 500 (details only logged). */
export function handler(fn: (req: Request, params: Record<string, string>) => Promise<Response>) {
  return async (req: Request, ctx?: Ctx): Promise<Response> => {
    try {
      const raw = ctx?.params ? await ctx.params : {};
      const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.join("/") : v]));
      return await fn(req, params);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.status, e.code, e.message);
      console.error("[api/v1]", e);
      return errorResponse(500, "internal_error", "Internal server error");
    }
  };
}

/** Parses the query string against a zod object schema; empty values count as absent. */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  const raw: Record<string, string> = {};
  for (const [k, v] of new URL(req.url).searchParams) if (v.trim() !== "") raw[k] = v.trim();
  const r = schema.safeParse(raw);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; ");
    throw new ApiError(400, "bad_request", msg);
  }
  return r.data;
}

export const q = {
  text: (max = 200) => z.string().max(max).optional(),
  country: z.string().regex(/^[a-zA-Z]{2}$/, "must be an ISO 3166-1 alpha-2 code").optional(),
  mode: z.enum(MODES as [string, ...string[]]).optional(),
  limit: (max: number) => z.coerce.number().int().min(1).max(max).optional(),
  date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 date-time").transform((s) => new Date(s)).optional(),
  num: (min: number, max: number) => z.coerce.number().min(min).max(max),
};

export const SEVERITIES = ["info", "minor", "major", "severe"] as [string, ...string[]];
export const HEALTHS = ["live", "stale", "failing", "pending"] as const;
