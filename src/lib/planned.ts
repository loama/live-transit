import type { Mode } from "./types";

/** A known official source not yet ingested, usually because it requires a registration key. */
export interface PlannedSource {
  name: string;
  country: string;
  modes: Mode[];
  url: string;
  reason: string;
}
