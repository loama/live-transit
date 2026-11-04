import type { Connector } from "@/lib/types";
import { avinor } from "./avinor";
import { blr } from "./blr";
import { bne } from "./bne";
import { dxb } from "./dxb";
import { faaNas } from "./faa";
import { fra } from "./fra";
import { gru } from "./gru";
import { hkia } from "./hkia";
import { lhr } from "./lhr";
import { mag } from "./mag";
import { sfo } from "./sfo";
import { syd } from "./syd";
import { tlv } from "./tlv";
import { tpe } from "./tpe";
import { wlg } from "./wlg";

export const aviation: Connector[] = [avinor, faaNas, hkia, fra, sfo, gru, mag, lhr, bne, dxb, tlv, tpe, syd, wlg, blr];
