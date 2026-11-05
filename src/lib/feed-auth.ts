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
