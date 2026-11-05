// Moves route geometry still stored in the routes table into geometry files (see src/ingest/geo.ts), then
// clears it from the database. Safe to re-run: sources without inline shapes are skipped.
// Usage: bun scripts/migrate-geo.ts [--concurrency=N]   (uses DATABASE_URL and BLOB_READ_WRITE_TOKEN)
import { db } from "@/db/client";
import { geoStore, publishGeo } from "@/ingest/geo";

const concurrency = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 6);
const sql = db();
const store = await geoStore();
const ids = (await sql`SELECT DISTINCT source_id FROM routes WHERE shapes <> '{}'`).map((r) => r.source_id as string);
console.log(`${ids.length} sources with inline geometry`);
let done = 0;
let tiles = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (ids.length) {
    const id = ids.shift()!;
    try {
      const rows = await sql`SELECT route_id, name, mode, color, shapes FROM routes WHERE source_id = ${id}`;
      tiles += await publishGeo(sql, id, rows.map((r) => ({ routeId: r.route_id as string, name: r.name as string, mode: r.mode as string, color: (r.color as string) ?? null, shapes: r.shapes as string[] })), store);
      await sql`UPDATE routes SET shapes = '{}' WHERE source_id = ${id}`;
    } catch (e) {
      // A source can be pruned while this runs; the rest still migrate.
      console.warn(`skipped ${id}: ${(e as Error).message.slice(0, 120)}`);
    }
    if (++done % 100 === 0) console.log(`${done} sources, ${tiles} tiles`);
  }
}));
console.log(`done: ${done} sources, ${tiles} tiles`);
await sql.end();
