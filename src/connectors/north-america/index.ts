import type { Connector } from "@/lib/types";
import { amtrak } from "./amtrak";
import { bart } from "./bart";
import { bcFerries } from "./bcferries";
import { calgaryTransit } from "./calgary";
import { capMetro } from "./capmetro";
import { cta } from "./cta";
import { edmontonEts } from "./edmonton";
import { halifaxTransit } from "./halifax";
import { hamiltonHsr } from "./hamilton";
import { kingCountyMetro } from "./kcm";
import { marta } from "./marta";
import { mbta } from "./mbta";
import { mtaBus, mtaLirr, mtaMetroNorth, mtaSubway } from "./mta";
import { metroTransitMn } from "./metrotransit";
import { njTransit } from "./njtransit";
import { nycFerry } from "./nycferry";
import { path } from "./path";
import { rtdDenver } from "./rtd";
import { septa } from "./septa";
import { stm } from "./stm";
import { ttc } from "./ttc";
import { wsf } from "./wsf";

export const northAmerica: Connector[] = [
  mtaSubway,
  mtaBus,
  mtaLirr,
  mtaMetroNorth,
  njTransit,
  path,
  nycFerry,
  mbta,
  cta,
  septa,
  bart,
  kingCountyMetro,
  metroTransitMn,
  capMetro,
  wsf,
  amtrak,
  marta,
  ttc,
  stm,
  bcFerries,
  edmontonEts,
  calgaryTransit,
  halifaxTransit,
  hamiltonHsr,
  rtdDenver,
];
