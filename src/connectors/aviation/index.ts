import type { Connector } from "@/lib/types";
import { avinor } from "./avinor";
import { bne } from "./bne";
import { dxb } from "./dxb";
import { faaNas } from "./faa";
import { fra } from "./fra";
import { gru } from "./gru";
import { hkia } from "./hkia";
import { ist } from "./ist";
import { lhr } from "./lhr";
import { mag } from "./mag";
import { sfo } from "./sfo";

export const aviation: Connector[] = [avinor, faaNas, hkia, fra, sfo, gru, mag, ist, lhr, bne, dxb];
