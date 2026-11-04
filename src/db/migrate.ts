import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "./client";

const sql = db();
const schema = readFileSync(join(import.meta.dir, "schema.sql"), "utf8");
for (const stmt of schema.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
  await sql.unsafe(stmt);
}
console.log("schema applied");
await sql.end();
