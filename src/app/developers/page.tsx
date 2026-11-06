import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/section";
import { RestSection } from "@/components/developers/rest-section";
import { McpSection } from "@/components/developers/mcp-section";

export const metadata: Metadata = {
  title: "API and MCP server",
  description: "Free REST API and MCP server for live transit data. Query metro status, train delays, airport boards, and vehicle positions. No API key required. OpenAPI spec included.",
  alternates: { canonical: "/developers" },
  openGraph: { title: "Developer API and MCP", url: "/developers" },
};

export default function DevelopersPage() {
  return (
    <Container className="pb-8">
      <PageHeader eyebrow="Developers" title="API and MCP server">
        The data behind this site is open to use. Query it over REST, or give your AI agent a live view of the world&apos;s transport networks.
      </PageHeader>
      <RestSection />
      <McpSection />
    </Container>
  );
}
