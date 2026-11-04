import type { Connector } from "@/lib/types";
import { casatramway } from "./casatramway";
import { gautrain } from "./gautrain";
import { myciti } from "./myciti";

export const africaMiddleEast: Connector[] = [gautrain, myciti, casatramway];
