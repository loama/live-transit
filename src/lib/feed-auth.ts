// Credentials for open-data portals that require a free account. Secrets live in environment variables only;
// registry files store plain download URLs, and requests to a listed host get the matching header added.

const MVB_TOKEN_URL = "https://user.mobilitaetsverbuende.at/auth/realms/dbp-public/protocol/openid-connect/token";
let mvb: { token: string; expires: number } | undefined;

/** Mobilitätsverbünde Österreich: OpenID password grant, cached until shortly before it expires. */
async function mvbToken(): Promise<string | undefined> {
  const user = process.env.AUSTRIA_MVB_EMAIL;
  const password = process.env.AUSTRIA_MVB_PASSWORD;
  if (!user || !password) return undefined;
  if (mvb && Date.now() < mvb.expires) return mvb.token;
  const r = await fetch(MVB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: "dbp-public-ui", grant_type: "password", scope: "openid", username: user, password }),
  });
  if (!r.ok) throw new Error(`Austria portal login failed: HTTP ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  mvb = { token: j.access_token, expires: Date.now() + (j.expires_in - 30) * 1000 };
  return mvb.token;
}

type Headers = Record<string, string>;
const AUTH: { host: string; headers: () => Promise<Headers> }[] = [
  { host: "nap.transportes.gob.es", headers: async (): Promise<Headers> => (process.env.SPAIN_NAP_API_KEY ? { ApiKey: process.env.SPAIN_NAP_API_KEY } : {}) },
  { host: "data.mobilitaetsverbuende.at", headers: async (): Promise<Headers> => { const t = await mvbToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } },
];

export async function authHeaders(url: string): Promise<Headers> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return {};
  }
  return (await AUTH.find((x) => host === x.host)?.headers()) ?? {};
}

const MVB_API = "https://data.mobilitaetsverbuende.at/api/public/v1/data-sets";

/**
 * Registry URLs can name a moving target. Austrian timetables are published per timetable year, so their URLs carry
 * `{year}`, replaced here by the newest active year: imports always use the current timetable, never an expired one.
 */
export async function resolveFeedUrl(url: string): Promise<string> {
  const m = url.match(/^https:\/\/data\.mobilitaetsverbuende\.at\/api\/public\/v1\/data-sets\/(\d+)\/\{year\}\/file$/);
  if (!m) return url;
  const r = await fetch(`${MVB_API}/${m[1]}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Austria dataset ${m[1]}: HTTP ${r.status}`);
  const d = (await r.json()) as { activeVersions?: { year: number | string }[] };
  const years = (d.activeVersions ?? []).map((v) => Number(v.year)).filter(Number.isFinite);
  if (!years.length) throw new Error(`Austria dataset ${m[1]} has no active timetable year`);
  return url.replace("{year}", String(Math.max(...years)));
}
