import postgres from "postgres";

declare global {
  var __sql: postgres.Sql | undefined;
}

function connect(): postgres.Sql {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const local = /localhost|127\.0\.0\.1/.test(url);
  return postgres(url, {
    max: local ? 1 : 10,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    ssl: local ? false : "require",
    types: { bigint: postgres.BigInt },
    onnotice: () => {},
  });
}

export function db(): postgres.Sql {
  globalThis.__sql ??= connect();
  return globalThis.__sql;
}
