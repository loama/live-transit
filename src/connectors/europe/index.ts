import type { Connector } from "@/lib/types";
import { atWienerLinien } from "./at-wiener-linien";
import { beSncbIrail } from "./be-sncb-irail";
import { deMunichMvg } from "./de-munich-mvg";
import { eeTallinnTransport } from "./ee-tallinn-transport";
import { esRenfeCercanias } from "./es-renfe-cercanias";
import { fiDigitrafficRail } from "./fi-digitraffic-rail";
import { fiHelsinkiHsl } from "./fi-helsinki-hsl";
import { frSncfAlerts } from "./fr-sncf-alerts";
import { ieDublinLuas } from "./ie-dublin-luas";
import { ieIrishRail } from "./ie-irish-rail";
import { itRomeMobilita } from "./it-rome-mobilita";
import { ltVilniusTransport } from "./lt-vilnius-transport";
import { nlOvapi } from "./nl-ovapi";
import { noEntur } from "./no-entur";
import { seSl } from "./se-sl";
import { tfl } from "./tfl";

export const europe: Connector[] = [
  tfl,
  atWienerLinien,
  beSncbIrail,
  deMunichMvg,
  eeTallinnTransport,
  esRenfeCercanias,
  fiDigitrafficRail,
  fiHelsinkiHsl,
  frSncfAlerts,
  ieDublinLuas,
  ieIrishRail,
  itRomeMobilita,
  ltVilniusTransport,
  nlOvapi,
  noEntur,
  seSl,
];
