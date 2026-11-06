import { siteUrl } from "@/data/site";

export interface AirportSchemaData {
  iataCode: string;
  name: string;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lon?: number | null;
}

export function buildAirportSchema(data: AirportSchemaData) {
  const base = siteUrl();
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Airport",
    name: data.name,
    iataCode: data.iataCode,
    url: `${base}/airports/${data.iataCode}`,
  };

  if (data.city || data.country) {
    schema.address = {
      "@type": "PostalAddress",
      ...(data.city ? { addressLocality: data.city } : {}),
      ...(data.country ? { addressCountry: data.country } : {}),
    };
  }

  if (data.lat != null && data.lon != null) {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: data.lat,
      longitude: data.lon,
    };
  }

  return schema;
}

export function AirportSchema({ data }: { data: AirportSchemaData }) {
  const schema = buildAirportSchema(data);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
