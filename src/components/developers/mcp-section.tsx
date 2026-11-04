import { CopyBlock } from "@/components/ui/copy-block";
import { Card } from "@/components/ui/section";
import { CLAUDE_CODE, CLAUDE_DESKTOP, CURSOR, MCP_TOOLS } from "./content";

export function McpSection() {
  return (
    <section id="mcp" className="scroll-mt-20 border-t border-border py-8">
      <h2 className="text-xl font-semibold tracking-tight">MCP server</h2>
      <p className="mt-2 max-w-2xl text-muted">
        Connect an AI assistant to live transit data over the Model Context Protocol. The server is remote, uses Streamable HTTP and needs no key.
      </p>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <CopyBlock label="Claude Code" code={CLAUDE_CODE} />
          <CopyBlock label="Cursor (.cursor/mcp.json)" code={CURSOR} />
          <CopyBlock label="Claude Desktop (claude_desktop_config.json)" code={CLAUDE_DESKTOP} />
        </div>
        <Card className="self-start overflow-hidden">
          <h3 className="border-b border-border px-4 py-2.5 text-sm font-medium">Tools</h3>
          <ul>
            {MCP_TOOLS.map(([name, desc]) => (
              <li key={name} className="border-b border-border px-4 py-2.5 last:border-0">
                <code className="font-mono text-[13px] font-semibold">{name}</code>
                <p className="text-sm text-muted">{desc}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="mt-4 text-sm text-muted">
        Try asking: &quot;Which London Underground lines have delays right now?&quot; or &quot;Is flight BA287 on time?&quot;
      </p>
    </section>
  );
}
