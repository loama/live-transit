export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return "http://localhost:3000";
}

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/disruptions", label: "Disruptions" },
  { href: "/airports", label: "Airports" },
  { href: "/coverage", label: "Coverage" },
  { href: "/status", label: "Status" },
  { href: "/developers", label: "API" },
] as const;
