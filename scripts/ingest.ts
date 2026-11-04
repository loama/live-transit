// Usage: bun scripts/ingest.ts [--force] [id ...]   Runs due connectors against DATABASE_URL.
import { db } from "@/db/client";
import { prune, runDue } from "@/ingest/runner";

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
const sql = db();
const s = await runDue(sql, { force, only: only.length ? only : undefined, budgetMs: 280_000 });
await prune(sql);
console.log(JSON.stringify(s, null, 2));
await sql.end();
