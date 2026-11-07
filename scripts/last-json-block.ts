// Prints the last fenced ```json block of an agent's answer, or the fallback when there is none. Agents end their
// answers with one: discovery candidates, PM review decisions.
// Usage: bun scripts/last-json-block.ts <answer.md> <fallback json>
import { readFileSync } from "node:fs";

const [file, fallback] = process.argv.slice(2);
if (!file || fallback === undefined) throw new Error("usage: bun scripts/last-json-block.ts <answer.md> <fallback json>");

const block = [...readFileSync(file, "utf8").matchAll(/```json\s*\n([\s\S]*?)```/g)].pop()?.[1];
console.log(JSON.stringify(JSON.parse(block ?? fallback), null, 2));
