import Link from "next/link";
import { CopyBlock } from "@/components/ui/copy-block";
import { Card } from "@/components/ui/section";
import { CURL_EXAMPLES, ENDPOINTS } from "./content";

export function RestSection() {
  return (
    <section id="rest" className="scroll-mt-20 py-8">
      <h2 className="text-xl font-semibold tracking-tight">REST API</h2>
      <p className="mt-2 max-w-2xl text-muted">
        Free, read-only JSON with CORS enabled and no key. Responses use a <code className="font-mono text-sm">{"{ data, meta }"}</code>{" "}
        envelope with <code className="font-mono text-sm">generatedAt</code> and source attribution. Please cache politely: data refreshes every 1 to 15 minutes.
      </p>
      <p className="mt-3 flex flex-wrap gap-4 text-sm">
        <Link href="/api/v1/openapi.json" className="text-accent hover:underline">OpenAPI 3.1 spec</Link>
        <Link href="/llms.txt" className="text-accent hover:underline">llms.txt</Link>
      </p>
      <Card className="mt-5 overflow-hidden">
        <ul>
          {ENDPOINTS.map(([path, desc]) => (
            <li key={path} className="grid gap-1 border-b border-border px-4 py-2.5 last:border-0 md:grid-cols-[22rem_1fr] md:gap-4">
              <code className="break-all font-mono text-[13px] font-medium">{path}</code>
              <span className="text-sm text-muted">{desc}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {CURL_EXAMPLES.map(([label, code]) => <CopyBlock key={code} label={label} code={code} />)}
      </div>
    </section>
  );
}
