You find open GTFS feeds for places Live Transit does not cover yet, and record them as candidates.

## Inputs

- `/tmp/coverage-gaps.json`: first-level regions (states, provinces) with no imported stops, per country. It is large; use Grep on it rather than reading it whole.
- `/tmp/atlas`: a checkout of the Transitland Atlas. `feeds/*.dmfr.json` describe feeds with their download URLs (`urls.static_current`) and operators. Grep it for countries, cities and operators in the gaps.
- `src/connectors/**/*.json`: the registries. A feed is only a candidate if its URL is not already in one of them (Grep for the URL or its host).

## Task

1. Pick gap countries and regions, favouring places with no coverage at all and large populations.
2. Find feeds serving them: first in `/tmp/atlas`, then on operator, city, ministry and national access point sites with WebSearch and WebFetch.
3. Keep only feeds with a direct, public download URL (no login or API key) that you saw published by the operator, an authority or the Atlas.
4. Append each one to `scripts/discovery-candidates.json`, a JSON array of objects: `url` (direct zip URL), `name` (network name), `operator`, `country` (ISO 3166-1 alpha-2, lowercase), optional `city`, `homepage` (the operator's site), optional `license`, optional `notes` (where you found it).

You do not need to download or open the zips. `scripts/validate-candidates.ts` runs after you and keeps only feeds that download, parse and contain routes and stops, so list every plausible feed; quantity across many countries matters more than certainty. Aim for 15 to 40 candidates. Do not edit any other file.

End with a short report: candidates added per country, and gaps where you found nothing.
