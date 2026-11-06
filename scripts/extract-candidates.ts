// Writes the last fenced ```json array in the discovery agent's report to the candidates file for validate-candidates.
// Usage: bun scripts/extract-candidates.ts <report.md> <candidates.json>
import { readFileSync, writeFileSync } from "node:fs";

const [report, out] = process.argv.slice(2);
if (!report || !out) throw new Error("usage: bun scripts/extract-candidates.ts <report.md> <candidates.json>");

const block = [...readFileSync(report, "utf8").matchAll(/```json\s*\n([\s\S]*?)```/g)].pop()?.[1];
const candidates: unknown = block ? JSON.parse(block) : [];
if (!Array.isArray(candidates)) throw new Error("the last json block in the report is not an array");
writeFileSync(out, `${JSON.stringify(candidates, null, 2)}\n`);
console.log(`${candidates.length} candidates extracted`);
