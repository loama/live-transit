import { siteUrl } from "@/data/site";

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function buildBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function BreadcrumbSchema({ items }: { items: BreadcrumbItem[] }) {
  const base = siteUrl();
  const fullItems = items.map((item) => ({
    name: item.name,
    url: item.url.startsWith("http") ? item.url : `${base}${item.url}`,
  }));
  const schema = buildBreadcrumbSchema(fullItems);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
