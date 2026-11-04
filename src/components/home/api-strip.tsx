import Link from "next/link";
import { CopyBlock } from "@/components/ui/copy-block";
import { Container } from "@/components/ui/section";

export function ApiStrip() {
  return (
    <div className="border-y border-border bg-surface">
      <Container className="grid grid-cols-[minmax(0,1fr)] gap-6 py-10 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Build on it. Or ask your agent.</h2>
          <p className="mt-2 max-w-md text-muted">
            The same data is available as a free JSON API and as an MCP server, so assistants can answer
            &quot;is the Jubilee line running?&quot; with a real source behind it.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link href="/developers" className="rounded-lg bg-fg px-4 py-2 font-medium text-bg hover:opacity-90">Read the docs</Link>
            <Link href="/developers#mcp" className="rounded-lg border border-border-strong px-4 py-2 font-medium hover:bg-surface-2">Set up MCP</Link>
          </div>
        </div>
        <CopyBlock code={'curl "{origin}/api/v1/alerts?severity=major"\n\nclaude mcp add --transport http \\\n  live-transit {origin}/api/mcp'} />
      </Container>
    </div>
  );
}
