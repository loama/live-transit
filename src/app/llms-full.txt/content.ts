import { listSources } from "@/db/queries/sources";
import { connectorById } from "@/connectors";

interface NetworkEntry {
  id: string;
  name: string;
  city: string | null;
  country: string;
  modes: string[];
  hasLive: boolean;
  hasStatus: boolean;
  hasAlerts: boolean;
  hasBoard: boolean;
}

const COUNTRY_NAMES: Record<string, string> = {
  us: "United States", gb: "United Kingdom", de: "Germany", fr: "France", es: "Spain",
  it: "Italy", ca: "Canada", au: "Australia", jp: "Japan", kr: "South Korea",
  cn: "China", br: "Brazil", mx: "Mexico", ar: "Argentina", cl: "Chile",
  nl: "Netherlands", be: "Belgium", ch: "Switzerland", at: "Austria", se: "Sweden",
  no: "Norway", dk: "Denmark", fi: "Finland", pl: "Poland", cz: "Czech Republic",
  pt: "Portugal", gr: "Greece", ie: "Ireland", nz: "New Zealand", sg: "Singapore",
  in: "India", ae: "United Arab Emirates", za: "South Africa", tr: "Turkey",
};

function countryName(cc: string): string {
  return COUNTRY_NAMES[cc.toLowerCase()] || cc.toUpperCase();
}

function determineDataTypes(source: Awaited<ReturnType<typeof listSources>>[0]) {
  const conn = connectorById.get(source.id);
  return {
    hasLive: !!conn?.live,
    hasStatus: source.counts.lines != null && source.counts.lines > 0,
    hasAlerts: source.activeAlerts > 0 || source.counts.alerts != null,
    hasBoard: source.modes.includes("air") || (source.counts.departures != null && source.counts.departures > 0),
  };
}

export async function generateFullListing(): Promise<string> {
  const sources = await listSources();
  const liveOrRecent = sources.filter((s) => s.health === "live" || (s.health === "stale" && s.lastSuccessAt));

  const byCountry = new Map<string, NetworkEntry[]>();
  for (const s of liveOrRecent) {
    const types = determineDataTypes(s);
    if (!byCountry.has(s.country)) byCountry.set(s.country, []);
    byCountry.get(s.country)!.push({
      id: s.id,
      name: s.name,
      city: s.city,
      country: s.country,
      modes: s.modes,
      ...types,
    });
  }

  const sortedCountries = [...byCountry.entries()].sort((a, b) => {
    const aCount = a[1].length;
    const bCount = b[1].length;
    if (aCount !== bCount) return bCount - aCount;
    return countryName(a[0]).localeCompare(countryName(b[0]));
  });

  const lines: string[] = [
    "# Live Transit - Full Network Coverage",
    "",
    "Live transit data from official sources worldwide. This listing includes all networks currently tracked.",
    "",
    `Coverage: ${liveOrRecent.length} networks across ${byCountry.size} countries.`,
    "",
    "## Networks by Country",
    "",
  ];

  let totalNetworks = 0;
  const maxCountries = 80;
  for (const [cc, networks] of sortedCountries.slice(0, maxCountries)) {
    lines.push(`### ${countryName(cc)}`);
    lines.push("");

    const sorted = networks.sort((a, b) => {
      if (a.city && !b.city) return -1;
      if (!a.city && b.city) return 1;
      if (a.city && b.city) return a.city.localeCompare(b.city);
      return a.name.localeCompare(b.name);
    });

    const maxPerCountry = cc === "us" || cc === "gb" || cc === "de" || cc === "fr" ? 30 : 15;
    for (const net of sorted.slice(0, maxPerCountry)) {
      const location = net.city ? `, ${net.city}` : "";
      const modes = net.modes.join(", ");

      const dataTypes: string[] = [];
      if (net.hasLive) dataTypes.push("live vehicles");
      if (net.hasStatus) dataTypes.push("line status");
      if (net.hasAlerts) dataTypes.push("alerts");
      if (net.hasBoard) dataTypes.push("board");
      const data = dataTypes.length > 0 ? dataTypes.join(", ") : "static timetable";

      lines.push(`- **${net.name}**${location} (\`${net.id}\`): /n/${encodeURIComponent(net.id)}`);
      lines.push(`  Modes: ${modes} | Data: ${data}`);
      lines.push("");

      totalNetworks++;
      if (totalNetworks >= 400) break;
    }

    if (totalNetworks >= 400) break;
  }

  lines.push("");
  lines.push("## Usage");
  lines.push("");
  lines.push("All network pages follow the pattern `/n/{id}` where `id` is the network identifier.");
  lines.push("Each network page includes:");
  lines.push("- Current service status and alerts");
  lines.push("- Live vehicle positions (where available)");
  lines.push("- Interactive map");
  lines.push("- Links to individual line pages at `/n/{id}/l/{lineId}`");
  lines.push("");
  lines.push("For programmatic access, use:");
  lines.push("- REST API: `/api/v1/sources/{id}`");
  lines.push("- MCP server: `/api/mcp` (tool: `network_status`)");
  lines.push("");

  return lines.join("\n");
}
