// Keycloak User Hilfsfunktionen (separat von groups.ts)
// Enthält Funktionen zum Anlegen / Lesen / Löschen von Benutzern.
// Nutzung: createUser({ email, firstName, lastName }) -> { id, created, error? }

const BASE_URL = process.env.KEYCLOAK_BASE_URL || "";
const REALM = process.env.KEYCLOAK_REALM || "";
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || "";
const ISSUER = process.env.KEYCLOAK_ISSUER || "";
let EFFECTIVE_BASE_URL = BASE_URL;
let EFFECTIVE_REALM = REALM;
if ((!EFFECTIVE_BASE_URL || !EFFECTIVE_REALM) && ISSUER) {
  const m = ISSUER.match(/^https?:\/\/[^/]+/);
  const realmMatch = ISSUER.match(/\/realms\/([^/]+)$/);
  if (!EFFECTIVE_BASE_URL && m) EFFECTIVE_BASE_URL = m[0];
  if (!EFFECTIVE_REALM && realmMatch) EFFECTIVE_REALM = realmMatch[1];
}

function envOk() { return !!(EFFECTIVE_BASE_URL && EFFECTIVE_REALM && CLIENT_ID && CLIENT_SECRET); }
function debug(msg: string, obj?: Record<string, unknown>) { if (process.env.KEYCLOAK_GROUP_SYNC_DEBUG === "1") console.log(`[kc-users] ${msg}`, obj||""); }

interface TokenResponse { access_token: string }
async function getAdminToken(): Promise<string | null> {
  if (!envOk()) { debug("ENV unvollständig für Token"); return null; }
  try {
    const form = new URLSearchParams();
    form.set("grant_type","client_credentials");
    form.set("client_id", CLIENT_ID);
    form.set("client_secret", CLIENT_SECRET);
    const r = await fetch(`${EFFECTIVE_BASE_URL}/realms/${encodeURIComponent(EFFECTIVE_REALM)}/protocol/openid-connect/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), cache: "no-store" });
    if (!r.ok) { debug("Token fehlgeschlagen", { status: r.status }); return null; }
    const j = await r.json() as Partial<TokenResponse>;
    return j.access_token || null;
  } catch (e) { debug("Token Exception", { e: e instanceof Error ? e.message : String(e) }); return null; }
}

export interface CreateUserParams { email: string; firstName?: string; lastName?: string }
export interface CreateUserResult { id?: string; created?: boolean; error?: string; status?: number }

export async function createUser(params: CreateUserParams): Promise<CreateUserResult> {
  const { email, firstName, lastName } = params;
  if (!email) return { error: "Email fehlt" };
  const token = await getAdminToken();
  if (!token) return { error: "Keycloak Token nicht verfügbar" };
  try {
    const resp = await fetch(`${EFFECTIVE_BASE_URL}/admin/realms/${encodeURIComponent(EFFECTIVE_REALM)}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, enabled: true, username: email, firstName, lastName, emailVerified: false }),
      cache: "no-store",
    });
    if (resp.status === 201) {
      // Location Header auslesen
      const loc = resp.headers.get("Location") || "";
      const m = loc.match(/\/users\/([^/]+)$/);
      if (m) return { id: m[1], created: true };
      // Fallback: Suche nach Email
      const search = await searchUserByEmail(email, token);
      if (search?.id) return { id: search.id, created: true };
      return { error: "Erstellung ohne ID", status: resp.status };
    }
    if (resp.status === 409) {
      // User existiert? Versuche Suche
      const existing = await searchUserByEmail(email, token);
      if (existing?.id) return { id: existing.id, created: false };
      return { error: "Konflikt (409) ohne ID", status: 409 };
    }
    const txt = await resp.text();
    return { error: `Keycloak Fehler ${resp.status}`, status: resp.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export interface KeycloakUser { id: string; email?: string; username?: string; firstName?: string; lastName?: string; enabled?: boolean }

async function searchUserByEmail(email: string, token: string): Promise<KeycloakUser | null> {
  try {
    const url = `${EFFECTIVE_BASE_URL}/admin/realms/${encodeURIComponent(EFFECTIVE_REALM)}/users?email=${encodeURIComponent(email)}&exact=true`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) return null;
    const arr = await r.json() as KeycloakUser[];
    return arr.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
  } catch { return null; }
}

export async function fetchUser(id: string): Promise<KeycloakUser | null> {
  const token = await getAdminToken();
  if (!token) return null;
  try {
    const r = await fetch(`${EFFECTIVE_BASE_URL}/admin/realms/${encodeURIComponent(EFFECTIVE_REALM)}/users/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) { debug("fetchUser not ok", { status: r.status }); return null; }
    return await r.json() as KeycloakUser;
  } catch (e) { debug("fetchUser exception", { e }); return null; }
}

export async function deleteUser(id: string): Promise<boolean> {
  const token = await getAdminToken();
  if (!token) return false;
  try {
    const r = await fetch(`${EFFECTIVE_BASE_URL}/admin/realms/${encodeURIComponent(EFFECTIVE_REALM)}/users/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    return r.ok;
  } catch { return false; }
}

export async function fetchUsersBatch(ids: string[]): Promise<Record<string, KeycloakUser | null>> {
  const result: Record<string, KeycloakUser | null> = {};
  for (const id of ids) {
    result[id] = await fetchUser(id);
  }
  return result;
}

