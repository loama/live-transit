/** Best-effort IANA timezone for a place, from ISO country and coordinates. Null when unknown. */
const SINGLE: Record<string, string> = {
  gb: "Europe/London", ie: "Europe/Dublin", fr: "Europe/Paris", de: "Europe/Berlin", es: "Europe/Madrid", it: "Europe/Rome",
  nl: "Europe/Amsterdam", be: "Europe/Brussels", lu: "Europe/Luxembourg", ch: "Europe/Zurich", at: "Europe/Vienna",
  se: "Europe/Stockholm", no: "Europe/Oslo", dk: "Europe/Copenhagen", fi: "Europe/Helsinki", pl: "Europe/Warsaw",
  cz: "Europe/Prague", sk: "Europe/Bratislava", hu: "Europe/Budapest", ro: "Europe/Bucharest", bg: "Europe/Sofia",
  gr: "Europe/Athens", pt: "Europe/Lisbon", lt: "Europe/Vilnius", lv: "Europe/Riga", ee: "Europe/Tallinn",
  hr: "Europe/Zagreb", si: "Europe/Ljubljana", rs: "Europe/Belgrade", ua: "Europe/Kyiv", tr: "Europe/Istanbul",
  is: "Atlantic/Reykjavik", ae: "Asia/Dubai", qa: "Asia/Qatar", sa: "Asia/Riyadh", il: "Asia/Jerusalem", eg: "Africa/Cairo",
  za: "Africa/Johannesburg", ma: "Africa/Casablanca", ke: "Africa/Nairobi", ng: "Africa/Lagos", in: "Asia/Kolkata",
  jp: "Asia/Tokyo", kr: "Asia/Seoul", cn: "Asia/Shanghai", hk: "Asia/Hong_Kong", sg: "Asia/Singapore", tw: "Asia/Taipei",
  th: "Asia/Bangkok", my: "Asia/Kuala_Lumpur", ph: "Asia/Manila", vn: "Asia/Ho_Chi_Minh", nz: "Pacific/Auckland",
  co: "America/Bogota", pe: "America/Lima", cl: "America/Santiago", ar: "America/Argentina/Buenos_Aires",
  uy: "America/Montevideo", ec: "America/Guayaquil", pa: "America/Panama", cr: "America/Costa_Rica",
};

export function timezoneFor(country: string | null | undefined, lat?: number | null, lon?: number | null): string | null {
  const c = (country ?? "").toLowerCase();
  if (SINGLE[c]) return SINGLE[c];
  if (lat == null || lon == null) return null;
  if (c === "us") {
    if (lon < -140) return lat > 40 ? "America/Anchorage" : "Pacific/Honolulu";
    return lon < -115 ? "America/Los_Angeles" : lon < -102 ? "America/Denver" : lon < -87 ? "America/Chicago" : "America/New_York";
  }
  if (c === "ca") return lon < -114 ? "America/Vancouver" : lon < -101 ? "America/Edmonton" : lon < -87 ? "America/Winnipeg" : lon < -60 ? "America/Toronto" : "America/Halifax";
  if (c === "au") return lon < 129 ? "Australia/Perth" : lon < 138 ? "Australia/Adelaide" : lat > -29 ? "Australia/Brisbane" : "Australia/Sydney";
  if (c === "br") return lon < -60 ? "America/Manaus" : "America/Sao_Paulo";
  if (c === "mx") return lon < -112 ? "America/Tijuana" : "America/Mexico_City";
  if (c === "ru") return lon < 45 ? "Europe/Moscow" : lon < 75 ? "Asia/Yekaterinburg" : lon < 105 ? "Asia/Novosibirsk" : "Asia/Vladivostok";
  return null;
}

function parts(d: Date, tz: string, extra: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", ...extra }).formatToParts(d);
}

/** "14:35" in the given zone. */
export function localHhmm(iso: string | null | undefined, tz: string): string {
  if (!iso) return "-";
  const p = parts(new Date(iso), tz, { hour: "2-digit", minute: "2-digit" });
  return `${p.find((x) => x.type === "hour")?.value}:${p.find((x) => x.type === "minute")?.value}`;
}

/** "UTC+1" offset of a zone at an instant. */
export function offsetLabel(tz: string, at = new Date()): string {
  const name = parts(at, tz, { timeZoneName: "shortOffset" }).find((x) => x.type === "timeZoneName")?.value ?? "GMT";
  return name === "GMT" ? "UTC+0" : name.replace("GMT", "UTC");
}
