import { siteUrl } from "@/data/site";

interface OrganizationSchemaData {
  name: string;
  description: string;
  url: string;
  logo?: string;
}

export function buildOrganizationSchema(data: OrganizationSchemaData) {
  const base = data.url;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: data.name,
        description: data.description,
        url: base,
        ...(data.logo ? { logo: { "@type": "ImageObject", url: data.logo } } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: data.name,
        url: base,
        publisher: { "@id": `${base}/#organization` },
      },
    ],
  };
}

export function OrganizationSchema() {
  const base = siteUrl();
  const schema = buildOrganizationSchema({
    name: "Live Transit",
    description: "A global, real-time status board for public transport. Airport boards, metros, trains, buses and ferries from official operator sources, with a public API and MCP server.",
    url: base,
    logo: `${base}/icon?9424ade78444dc12`,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
