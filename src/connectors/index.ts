import type { Connector } from "@/lib/types";
import { africaMiddleEast } from "./africa-middle-east";
import { asiaPacific } from "./asia-pacific";
import { aviation } from "./aviation";
import { europe } from "./europe";
import { globalGtfs } from "./global-gtfs";
import { latam } from "./latam";
import { northAmerica } from "./north-america";

export const connectors: Connector[] = [
  ...northAmerica,
  ...latam,
  ...europe,
  ...africaMiddleEast,
  ...asiaPacific,
  ...aviation,
  ...globalGtfs,
];

const ids = new Set<string>();
for (const c of connectors) {
  if (ids.has(c.meta.id)) throw new Error(`duplicate connector id ${c.meta.id}`);
  ids.add(c.meta.id);
}

export const connectorById = new Map(connectors.map((c) => [c.meta.id, c]));
