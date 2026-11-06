import { dataSchemas } from "./schemas-data";
import { schemas } from "./schemas";
import { corePaths } from "./paths-core";
import { networkPaths } from "./paths-network";
import { stationPaths } from "./paths-stations";
import { realtimePaths, realtimeSchemas } from "./paths-realtime";
import type { Json } from "./helpers";

const errorBody = (code: string, message: string) => ({ error: { code, message } });
const errResponse = (description: string, code: string, message: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: errorBody(code, message) } },
});

export const openapi: Json = {
  openapi: "3.1.0",
  info: {
    title: "Live Transit API",
    version: "1.0.0",
    summary: "Real-time public transport status from official sources.",
    description:
      "Airport boards, metros, trains, buses and ferries worldwide, taken from official operator feeds. No authentication, CORS enabled. Changes are also pushed as a Server-Sent Events stream and to webhooks. " +
      "Every response is `{ data, meta }`. Items carry `updatedAt`/`lastSeenAt`, and sources carry a `health` of live, stale, failing or pending.",
  },
  servers: [{ url: "/", description: "Site origin" }],
  tags: ["Meta", "Sources", "Alerts", "Network", "Stations", "Vehicles", "Search", "Realtime"].map((name) => ({ name })),
  paths: {
    ...corePaths,
    ...networkPaths,
    ...stationPaths,
    ...realtimePaths,
    "/api/v1/openapi.json": {
      get: {
        summary: "OpenAPI document",
        description: "This document.",
        operationId: "getOpenApi",
        tags: ["Meta"],
        responses: { "200": { description: "OpenAPI 3.1 document", content: { "application/json": { schema: { type: "object" }, example: { openapi: "3.1.0" } } } } },
      },
    },
  },
  components: {
    schemas: { ...schemas, ...dataSchemas, ...realtimeSchemas },
    responses: {
      BadRequest: errResponse("Invalid parameters", "bad_request", "q: must be at least 2 characters"),
      NotFound: errResponse("Resource not found", "not_found", 'Unknown source "x"'),
      ServerError: errResponse("Unexpected error", "internal_error", "Internal server error"),
    },
  },
};
