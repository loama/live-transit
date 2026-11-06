import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui/section";

export const metadata: Metadata = {
  title: "About Live Transit",
  description: "One global status board for public transport. Data from official operator feeds, updated every few minutes, with attribution and licensing.",
  alternates: { canonical: "/about" },
  openGraph: { title: "About", url: "/about" },
};

const P = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-pretty text-muted">{children}</p>;
const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-10 text-xl font-semibold tracking-tight">{children}</h2>;

export default function AboutPage() {
  return (
    <Container className="pb-12">
      <PageHeader eyebrow="About" title="One status board for public transport" />
      <div className="max-w-2xl pt-2">
        <H>Why this exists</H>
        <P>
          Every operator publishes service status somewhere, in a different format, on a different site. Checking whether
          your metro, your train and your flight are running should not take four apps. Live Transit reads official
          feeds, normalizes them into one model, and shows the result with the freshness and the original source next to it.
        </P>
        <H>Where the data comes from</H>
        <P>
          Only official sources: operator APIs, GTFS Realtime feeds, airport authority boards and open data portals.
          We do not scrape social media or use crowdsourced reports. The <Link className="text-accent hover:underline" href="/coverage">coverage page</Link>{" "}
          lists every source, and each network page links to the operator and names the license.
        </P>
        <H>How fresh is it</H>
        <P>
          Each source is polled on its own schedule, from every minute to every fifteen. Every page shows when the data last
          updated, and the <Link className="text-accent hover:underline" href="/status">status page</Link> shows which feeds are late or failing.
          If a feed stops, the page says so instead of presenting old data as current.
        </P>
        <H>Attribution and licenses</H>
        <P>
          Data remains the property of the respective operators and is shown under the license each one publishes, such as
          the Open Government Licence, Creative Commons, or the operator&apos;s open data terms. Required attribution appears
          on the network page and in API responses. Basemap tiles come from OpenFreeMap using OpenStreetMap data.
        </P>
        <H>Use it in your own tools</H>
        <P>
          There is a free <Link className="text-accent hover:underline" href="/developers#rest">REST API</Link> and an{" "}
          <Link className="text-accent hover:underline" href="/developers#mcp">MCP server</Link> for AI agents.
        </P>
        <H>Limits</H>
        <P>
          Live Transit is an aggregator. It is not an operator, is not affiliated with any of them, and is not a safety
          system. For anything time critical, confirm with the operator through the link on each network page.
        </P>
      </div>
    </Container>
  );
}
