import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getSource, listSources } from "@/db/queries";
import { ATTRIBUTION, READ_ONLY, asOf, capNote, clip, fail, ok, plural } from "../format";

type Detail = NonNullable<Awaited<ReturnType<typeof getSource>>>;

const MAX_SOURCES = 4;
const MAX_LINES = 40;
const MAX_ALERTS = 6;

export function describeNetwork(s: Detail, now = new Date()): string {
  const bad = s.lines.filter((l) => l.status !== "good" && l.status !== "unknown");
  const good = s.lines.length - bad.length;
  const out = [
    `## ${s.name} (${s.operator}, ${s.city ?? s.country.toUpperCase()}) | source_id: ${s.id}`,
    `Feed health: ${s.health}; ${asOf(s.lastSuccessAt, now)}; polled every ${s.intervalMinutes} min.${s.lastError && s.health !== "live" ? ` Last error: ${clip(s.lastError, 120)}` : ""}`,
  ];
  if (s.lines.length) {
    out.push(`Lines: ${plural(s.lines.length, "line")}, ${good} good or unknown, ${bad.length} disrupted.`);
    const shown = [...bad, ...s.lines.filter((l) => !bad.includes(l))].slice(0, MAX_LINES);
    for (const l of shown) out.push(`- ${l.lineName} (${l.mode}): ${l.status}${l.statusText && l.statusText !== l.status ? `, ${clip(l.statusText, 120)}` : ""}`);
    out.push(capNote(shown.length, s.lines.length, "Use search to find a specific line.").trimEnd());
  } else {
    out.push("No per-line status is published by this source.");
  }
  if (s.alerts.length) {
    out.push(`Active alerts: ${s.alerts.length}`);
    for (const a of s.alerts.slice(0, MAX_ALERTS)) out.push(`- [${a.severity}] ${clip(a.title, 140)}${a.routes.length ? ` (${a.routes.slice(0, 4).join(", ")})` : ""}`);
    out.push(capNote(Math.min(MAX_ALERTS, s.alerts.length), s.alerts.length, "Call disruptions with source filters for more.").trimEnd());
  } else {
    out.push("Active alerts: none.");
  }
  if (s.stations.length) out.push(`Stations/airports tracked: ${s.stations.length}.`);
  out.push(`Source: ${s.attribution ?? s.operator} (${s.homepage})`);
  return out.filter(Boolean).join("\n");
}

export function registerNetworkStatus(server: McpServer) {
  server.registerTool(
    "network_status",
    {
      title: "Network status",
      description:
        "Status of every line in a transit network plus active alerts and data freshness. Give exactly one of source_id (exact, from search), city, or operator. A city can match several networks; each is summarized.",
      inputSchema: z.object({
        source_id: z.string().optional().describe("Exact source id from search results, e.g. 'gb-london-tfl'."),
        city: z.string().optional().describe("City name, e.g. 'London' or 'Dublin'."),
        operator: z.string().optional().describe("Operator or network name, e.g. 'TfL', 'BART', 'Luas'."),
      }),
      annotations: READ_ONLY,
    },
    async ({ source_id, city, operator }) => {
      const given = [source_id, city, operator].filter(Boolean).length;
      if (given !== 1) return fail("Provide exactly one of source_id, city or operator. Use the search tool first if you do not know the id.");
      let ids: string[];
      if (source_id) ids = [source_id];
      else {
        // Curated per-line feeds first, bulk GTFS bus alert feeds last, so "London" means TfL before London, Ontario.
        const rank = (s: { id: string; counts: Record<string, number> }) => ((s.counts.lines ?? 0) > 0 ? 0 : (s.counts.stations ?? 0) > 0 ? 1 : 2) + (s.id.startsWith("gtfs-") ? 3 : 0);
        ids = (await listSources({ q: (city ?? operator)! })).sort((a, b) => rank(a) - rank(b)).map((s) => s.id);
      }
      if (!ids.length) {
        return fail(`No tracked network matches "${city ?? operator}". Use search to find the exact name, or list_sources to browse coverage.`);
      }
      const shownIds = ids.slice(0, MAX_SOURCES);
      const details = (await Promise.all(shownIds.map((id) => getSource(id)))).filter((d): d is Detail => !!d);
      if (!details.length) return fail(`Unknown source_id "${source_id}". Use search to find valid ids.`);
      const parts = details.map((d) => describeNetwork(d));
      const omitted = ids.length - shownIds.length;
      if (omitted > 0) parts.push(`${omitted} more matching networks omitted. Pass a source_id from search to see one.`);
      parts.push(ATTRIBUTION);
      const data = details.map(({ stations: _s, recentRuns: _r, endpoints: _e, lines, alerts, ...rest }) => ({
        ...rest,
        lines: lines.slice(0, 200),
        alerts: alerts.slice(0, 50),
        linesTotal: lines.length,
        alertsTotal: alerts.length,
      }));
      return ok(parts.join("\n\n"), { matched: ids.length, networks: data });
    },
  );
}
