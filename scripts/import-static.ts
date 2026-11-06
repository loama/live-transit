// Usage: bun scripts/import-static.ts [--force] [--concurrency=N] [--timeout=seconds] [--budget=minutes] [id ...]
// Imports static GTFS line catalogs (routes, colors, geometry) into DATABASE_URL. Without ids, imports every
// due source; --force re-imports even fresh ones.
import { db } from "@/db/client";
import { importDueStatic } from "@/ingest/static";

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const concurrency = Number(args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 4);
const timeout = args.find((a) => a.startsWith("--timeout="))?.split("=")[1];
const budget = Number(args.find((a) => a.startsWith("--budget="))?.split("=")[1] ?? 360);
const sql = db();
const s = await importDueStatic(sql, {
  force: args.includes("--force"),
  only: only.length ? only : undefined,
  concurrency,
  budgetMs: budget * 60_000,
  ...(timeout ? { perFeedMs: Number(timeout) * 1000 } : {}),
});
for (const i of s.imported) console.log(`OK   ${i.id} routes=${i.routes} shapes=${i.shapes} stops=${i.stops} ${i.ms}ms`);
for (const f of s.failed) console.log(`FAIL ${f.id} ${f.error}`);
console.log(`${s.imported.length} imported, ${s.unchanged.length} unchanged, ${s.failed.length} failed, ${s.remaining} left`);
await sql.end();
