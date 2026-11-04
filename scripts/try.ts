// Usage: bun scripts/try.ts <connector-id | group-prefix> [--json]
// Runs connectors live (no database) and prints counts plus samples.
import { connectors } from "@/connectors";
import { runConnector } from "./harness";

const arg = process.argv[2] ?? "";
const json = process.argv.includes("--json");
const pick = connectors.filter((c) => c.meta.id === arg || c.meta.id.startsWith(arg));
if (!pick.length) {
  console.error(`no connector matches "${arg}". Known: ${connectors.map((c) => c.meta.id).join(", ")}`);
  process.exit(1);
}
let failed = 0;
await Promise.all(
  pick.map(async (c) => {
    const t = Date.now();
    try {
      const r = await runConnector(c);
      const counts = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v as unknown[]).length]));
      console.log(`OK   ${c.meta.id} ${Date.now() - t}ms ${JSON.stringify(counts)}`);
      if (json) for (const [k, v] of Object.entries(r)) console.log(`  ${k}:`, JSON.stringify((v as unknown[]).slice(0, 2)));
    } catch (e) {
      failed++;
      console.log(`FAIL ${c.meta.id} ${Date.now() - t}ms ${(e as Error).message.slice(0, 300)}`);
    }
  }),
);
console.log(`${pick.length - failed}/${pick.length} ok`);
process.exit(failed ? 1 : 0);
