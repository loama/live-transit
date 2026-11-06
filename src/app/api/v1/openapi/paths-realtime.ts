import { envelope, list, param, pathParam, ref, type Json } from "./helpers";
import { NEWS_KINDS } from "@/lib/news";

const changeEx = {
  id: "48213", at: "2026-11-06T08:14:03.000Z", sourceId: "at-vienna-wiener-linien", sourceName: "Wiener Linien", country: "at",
  subject: "line", subjectId: "U6", subjectName: "U6", from: "good", to: "major", text: "Delays after a signal fault", severity: null,
  url: "https://livetransit.vercel.app/n/at-vienna-wiener-linien/l/U6",
};

const newsEx = {
  id: "wl-u2-u5-2026", date: "2026-10-20", title: "U5 construction progress", summary: "Works on the new U5 line continue.",
  url: "https://www.wienerlinien.at/", sourceIds: ["at-vienna-wiener-linien"], country: "at", kind: "network_change",
};

const filters = [
  param("sourceId", "Comma separated network ids.", { type: "string" }, { example: "at-vienna-wiener-linien" }),
  param("country", "Comma separated ISO 3166-1 alpha-2 codes.", { type: "string" }, { example: "at,de" }),
  param("subject", "Comma separated kinds: line, station, alert.", { type: "string" }, { example: "line,alert" }),
];

const subscription = {
  id: "0f8b8c2e-3d7a-4c1e-9b4a-2b6f5e1d9a10", url: "https://example.org/hooks/transit", sourceIds: ["at-vienna-wiener-linien"],
  countries: [], subjects: ["line", "alert"],
};

const json = (schema: Json, example: unknown, description = "Success") => ({ description, content: { "application/json": { schema, example } } });
const bad = { "400": { $ref: "#/components/responses/BadRequest" } };

export const realtimePaths: Json = {
  "/api/v1/stream": {
    get: {
      tags: ["Realtime"], operationId: "streamChanges", summary: "Stream changes as they happen",
      description:
        "Server-Sent Events. Each line, station or alert change is sent as an `event: change` message whose `id` is a cursor, as soon as it is ingested. Connections close after about five minutes; EventSource clients reconnect with `Last-Event-ID` and receive what they missed. Pass `after` to start from a cursor without that header.",
      parameters: [...filters, param("after", "Replay events after this cursor.", { type: "string" }, { example: "48200" })],
      responses: {
        "200": {
          description: "An event stream of `Change` objects.",
          content: { "text/event-stream": { schema: { type: "string" }, example: `id: 48213\nevent: change\ndata: ${JSON.stringify(changeEx)}\n\n` } },
        },
        ...bad,
      },
    },
  },
  "/api/v1/webhooks": {
    post: {
      tags: ["Realtime"], operationId: "createWebhook", summary: "Subscribe a URL to changes",
      description:
        "Before the subscription is created, the URL receives `{ \"type\": \"webhook.verify\", \"challenge\": \"...\" }` and must answer 2xx with the challenge in its body. Then every minute it receives `{ \"type\": \"changes\", \"subscription\": id, \"events\": [Change] }` for new matching changes. Requests carry `X-Live-Transit-Signature: t=<unix>,v1=<hex HMAC-SHA256 of \"t.body\" keyed by the secret>`. URLs must be public HTTPS; redirects are not followed. Subscriptions stop after 20 consecutive failed deliveries. At most 5 subscriptions per client per day.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object", required: ["url"],
              properties: {
                url: { type: "string", format: "uri" }, sourceIds: list({ type: "string" }), countries: list({ type: "string" }),
                subjects: list({ type: "string", enum: ["line", "station", "alert"] }),
              },
            },
            example: { url: subscription.url, sourceIds: subscription.sourceIds, subjects: subscription.subjects },
          },
        },
      },
      responses: {
        "201": json({ type: "object", properties: { data: ref("Webhook") } }, { data: { ...subscription, secret: "4f1c...e9" } }, "Created; keep the secret to verify signatures and manage the subscription"),
        ...bad,
        "429": { description: "Too many subscriptions from this client today" },
      },
    },
  },
  "/api/v1/webhooks/{id}": {
    get: {
      tags: ["Realtime"], operationId: "getWebhook", summary: "Subscription status",
      description: "Delivery state of a subscription. Authenticate with `Authorization: Bearer <secret>`.",
      parameters: [pathParam("id", "Subscription id", subscription.id)],
      responses: {
        "200": json({ type: "object", properties: { data: ref("Webhook") } }, { data: { ...subscription, createdAt: "2026-11-06T08:00:00.000Z", lastEventId: "48213", lastDelivery: "2026-11-06T08:15:00.000Z", failures: 0, lastError: null, active: true } }),
        "404": { $ref: "#/components/responses/NotFound" },
      },
    },
    delete: {
      tags: ["Realtime"], operationId: "deleteWebhook", summary: "Unsubscribe",
      description: "Deletes a subscription. Authenticate with `Authorization: Bearer <secret>`.",
      parameters: [pathParam("id", "Subscription id", subscription.id)],
      responses: { "204": { description: "Deleted" }, "404": { $ref: "#/components/responses/NotFound" } },
    },
  },
  "/api/v1/news": {
    get: {
      tags: ["Realtime"], operationId: "listNews", summary: "Transport news",
      description: "Curated news about new lines, closures, timetable and network changes, newest first. Updated daily from operator and authority announcements.",
      parameters: [
        param("country", "ISO 3166-1 alpha-2 code.", { type: "string" }, { example: "at" }),
        param("kind", "News kind.", { type: "string", enum: [...NEWS_KINDS] }, { example: "new_line" }),
        param("sourceId", "Only news mentioning this network.", { type: "string" }, { example: "at-vienna-wiener-linien" }),
        param("since", "Only items on or after this date.", { type: "string", format: "date" }, { example: "2026-10-01" }),
        param("limit", "Maximum items (1 to 100).", { type: "integer", minimum: 1, maximum: 100 }, { example: 20 }),
      ],
      responses: { "200": json(envelope(list(ref("NewsItem"))), { data: [newsEx], meta: { generatedAt: "2026-11-06T08:00:00.000Z", count: 1 } }), ...bad },
    },
  },
};

export const realtimeSchemas: Json = {
  NewsItem: {
    type: "object", required: ["id", "date", "title", "summary", "url", "sourceIds", "country", "kind"],
    properties: {
      id: { type: "string" }, date: { type: "string", format: "date" }, title: { type: "string" }, summary: { type: "string" },
      url: { type: "string", format: "uri", description: "The original announcement." }, sourceIds: list({ type: "string" }),
      country: { type: "string" }, kind: { type: "string", enum: [...NEWS_KINDS] },
    },
    example: newsEx,
  },
  Change: {
    type: "object",
    required: ["id", "at", "sourceId", "sourceName", "country", "subject", "subjectId", "subjectName", "to", "url"],
    properties: {
      id: { type: "string", description: "Cursor, increasing." }, at: { type: "string", format: "date-time" },
      sourceId: { type: "string" }, sourceName: { type: "string" }, country: { type: "string" },
      subject: { type: "string", enum: ["line", "station", "alert"] }, subjectId: { type: "string" }, subjectName: { type: "string" },
      from: { type: ["string", "null"], description: "Previous status; null for alerts and first sightings." },
      to: { type: "string", description: "New status, or opened / resolved for alerts." },
      text: { type: ["string", "null"] }, severity: { type: ["string", "null"] }, url: { type: "string", format: "uri" },
    },
    example: changeEx,
  },
  Webhook: {
    type: "object", required: ["id", "url"],
    properties: {
      id: { type: "string", format: "uuid" }, url: { type: "string", format: "uri" }, secret: { type: "string", description: "Only returned on creation." },
      sourceIds: list({ type: "string" }), countries: list({ type: "string" }), subjects: list({ type: "string" }),
      createdAt: { type: "string", format: "date-time" }, lastEventId: { type: "string" }, lastDelivery: { type: ["string", "null"], format: "date-time" },
      failures: { type: "integer" }, lastError: { type: ["string", "null"] }, active: { type: "boolean" },
    },
  },
};
