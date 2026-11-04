import type { Connector } from "@/lib/types";
import { beloHorizonteBus } from "./br-belo-horizonte";
import { rioBrt, rioSppo } from "./br-rio";
import { saoPauloArtesp, saoPauloMetro } from "./br-sao-paulo-rail";
import { santiagoMetro } from "./cl-santiago-metro";
import { santiagoRed } from "./cl-santiago-red";
import { transmilenio } from "./co-bogota-transmilenio";
import { medellinMetro } from "./co-medellin-metro";

export const latam: Connector[] = [
  medellinMetro,
  transmilenio,
  santiagoMetro,
  santiagoRed,
  saoPauloMetro,
  saoPauloArtesp,
  rioBrt,
  rioSppo,
  beloHorizonteBus,
];
