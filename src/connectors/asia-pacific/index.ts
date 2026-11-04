import type { Connector } from "@/lib/types";
import { auAdelaideMetro } from "./au-adelaide-metro";
import { auBrisbaneTranslink } from "./au-brisbane-translink";
import { hkMtr } from "./hk-mtr";
import { hkMtrNextTrain } from "./hk-mtr-nexttrain";
import { hkTrafficNews } from "./hk-td-traffic-news";
import { jpJrCentral } from "./jp-jr-central";
import { jpJrWest } from "./jp-jr-west";
import { jpOsakaMetro } from "./jp-osaka-metro";
import { myKtmb } from "./my-ktmb";
import { myMybas } from "./my-mybas";
import { myPrasaranaBus } from "./my-prasarana-bus";

export const asiaPacific: Connector[] = [
  hkMtr,
  hkMtrNextTrain,
  hkTrafficNews,
  jpJrWest,
  jpJrCentral,
  jpOsakaMetro,
  myPrasaranaBus,
  myKtmb,
  myMybas,
  auBrisbaneTranslink,
  auAdelaideMetro,
];
