// Usage: bun scripts/import-static.ts [--force] [--concurrency=N] [id ...]
// Imports static GTFS line catalogs (routes, colors, geometry) into DATABASE_URL. Without ids, imports every
// due source; --force re-imports even fresh ones.
import { db } from "@/db/client";
import { importDueStatic } from "@/ingest/static";

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const concurrency = Number(args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 4);
const sql = db();
const s = await importDueStatic(sql, {
  force: args.includes("--force"),
  only: only.length ? only : undefined,
  concurrency,
  budgetMs: 6 * 3600_000,
});
for (const i of s.imported) console.log(`OK   ${i.id} routes=${i.routes} shapes=${i.shapes} ${i.ms}ms`);
for (const f of s.failed) console.log(`FAIL ${f.id} ${f.error}`);
console.log(`${s.imported.length} imported, ${s.failed.length} failed, ${s.remaining} left`);
await sql.end();
