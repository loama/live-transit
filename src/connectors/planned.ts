import type { PlannedSource } from "@/lib/planned";
import { planned as africaMiddleEast } from "./africa-middle-east/planned";
import { planned as asiaPacific } from "./asia-pacific/planned";
import { planned as aviation } from "./aviation/planned";
import { planned as europe } from "./europe/planned";
import { planned as globalGtfs } from "./global-gtfs/planned";
import { planned as latam } from "./latam/planned";
import { planned as northAmerica } from "./north-america/planned";

export const plannedSources: PlannedSource[] = [
  ...northAmerica,
  ...latam,
  ...europe,
  ...africaMiddleEast,
  ...asiaPacific,
  ...aviation,
  ...globalGtfs,
];
