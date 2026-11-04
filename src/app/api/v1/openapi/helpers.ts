export type Json = Record<string, unknown>;

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const param = (name: string, description: string, schema: Json = { type: "string" }, extra: Json = {}) => ({
  name,
  in: "query",
  description,
  required: false,
  schema,
  ...extra,
});

export const pathParam = (name: string, description: string, example: string) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string" },
  example,
});

/** Envelope schema wrapping `data`. */
export const envelope = (data: Json, withCursor = false): Json => ({
  type: "object",
  required: ["data", "meta"],
  properties: {
    data,
    meta: withCursor ? { $ref: "#/components/schemas/PagedMeta" } : ref("Meta"),
  },
});

export const list = (item: Json) => ({ type: "array", items: item });

const errors = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "500": { $ref: "#/components/responses/ServerError" },
};

interface Op {
  summary: string;
  description: string;
  tag: string;
  operationId: string;
  parameters?: Json[];
  data: Json;
  example: unknown;
  paged?: boolean;
  notFound?: boolean;
  noBadRequest?: boolean;
}

/** Builds a GET operation with a 200 envelope response, shared error responses and one example. */
export function get(o: Op): Json {
  const responses: Json = {
    "200": {
      description: "Success",
      content: {
        "application/json": {
          schema: envelope(o.data, o.paged),
          example: {
            data: o.example,
            meta: { generatedAt: "2026-11-04T12:00:00.000Z", count: Array.isArray(o.example) ? o.example.length : 1 },
          },
        },
      },
    },
    ...(o.noBadRequest ? { "500": errors["500"] } : errors),
    ...(o.notFound ? { "404": { $ref: "#/components/responses/NotFound" } } : {}),
  };
  return {
    get: {
      summary: o.summary,
      description: o.description,
      operationId: o.operationId,
      tags: [o.tag],
      ...(o.parameters?.length ? { parameters: o.parameters } : {}),
      responses,
    },
  };
}

export const limitParam = (max: number, def: number) =>
  param("limit", `Maximum items to return (default ${def}, max ${max}).`, { type: "integer", minimum: 1, maximum: max });

export const countryParam = param("country", "ISO 3166-1 alpha-2 country code, e.g. `gb`.", { type: "string", pattern: "^[A-Za-z]{2}$" }, { example: "gb" });

export const modeParam = param("mode", "Transport mode.", { $ref: "#/components/schemas/Mode" }, { example: "metro" });
