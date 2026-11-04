export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function flag(cc: string | null | undefined): string {
  if (!cc || cc.length !== 2 || cc === "xx") return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryName(cc: string | null | undefined): string {
  if (!cc) return "Unknown";
  if (cc === "xx") return "Multi-country";
  try {
    return regionNames?.of(cc.toUpperCase()) ?? cc.toUpperCase();
  } catch {
    return cc.toUpperCase();
  }
}

export const nf = new Intl.NumberFormat("en-US");

export const MODE_LABEL: Record<string, string> = {
  air: "Air", rail: "Rail", metro: "Metro", tram: "Tram", bus: "Bus", ferry: "Ferry", cable: "Cable", other: "Other",
};

export const REGION_LABEL: Record<string, string> = {
  africa: "Africa", asia: "Asia", europe: "Europe", latam: "Latin America",
  "north-america": "North America", oceania: "Oceania", "middle-east": "Middle East",
};

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${nf.format(n)} ${n === 1 ? one : many}`;
}

export function safeHref(u: string | null | undefined): string | null {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : null;
}
