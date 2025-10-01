// Zentrale Keycloak-Gruppen-Hilfsfunktionen
// Erwartet, dass BaseGruppe.beschreibung die Keycloak-Gruppen-ID (UUID) enthält.
// Nutzt Client-Credentials Flow.

const BASE_URL = process.env.KEYCLOAK_BASE_URL || ""; // z.B. https://sso.example.org
const REALM = process.env.KEYCLOAK_REALM || "";       // z.B. master oder meinrealm
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || "";
// Versuche aus KEYCLOAK_ISSUER (wie https://sso.example.org/realms/myrealm) Basis & Realm abzuleiten wenn nicht explizit gesetzt
const ISSUER = process.env.KEYCLOAK_ISSUER || "";
let EFFECTIVE_BASE_URL = BASE_URL;
let EFFECTIVE_REALM = REALM;
if ((!EFFECTIVE_BASE_URL || !EFFECTIVE_REALM) && ISSUER) {
  const m = ISSUER.match(/^https?:\/\/[^/]+/);
  const realmMatch = ISSUER.match(/\/realms\/([^/]+)$/);
  if (!EFFECTIVE_BASE_URL && m) EFFECTIVE_BASE_URL = m[0];
  if (!EFFECTIVE_REALM && realmMatch) EFFECTIVE_REALM = realmMatch[1];
}

function debug(msg: string, obj?: Record<string, unknown>) {
  if (process.env.KEYCLOAK_GROUP_SYNC_DEBUG === "1") {
    console.log(`[kc-group-sync] ${msg}`, obj || "");
  }
}

interface TokenResponse { access_token: string; token_type: string; expires_in: number }

async function getAdminToken(): Promise<string | null> {
  if (!EFFECTIVE_BASE_URL || !EFFECTIVE_REALM || !CLIENT_ID || !CLIENT_SECRET) {
    debug("Umgebungsvariablen unvollständig", { EFFECTIVE_BASE_URL, EFFECTIVE_REALM, CLIENT_ID_SET: !!CLIENT_ID, CLIENT_SECRET_SET: !!CLIENT_SECRET });
    return null;
  }
  try {
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("client_id", CLIENT_ID);
    form.set("client_secret", CLIENT_SECRET);
    const resp = await fetch(`${EFFECTIVE_BASE_URL}/realms/${encodeURIComponent(EFFECTIVE_REALM)}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
    });
    if (!resp.ok) {
      debug("Token Abruf fehlgeschlagen", { status: resp.status });
      return null;
    }
    const json = await resp.json() as Partial<TokenResponse>;
    return json.access_token || null;
  } catch (e) {
    debug("Token Exception", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

async function kcFetch(path: string, options: RequestInit & { token: string }): Promise<boolean> {
  try {
    const { token, ...rest } = options;
    const resp = await fetch(`${EFFECTIVE_BASE_URL}/admin/realms/${encodeURIComponent(EFFECTIVE_REALM)}${path}`, {
      ...rest,
      headers: { ...(rest.headers||{}), Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) debug("KC Fetch nicht ok", { path, status: resp.status });
    return resp.ok;
  } catch (e) {
    debug("KC Fetch Exception", { path, e });
    return false;
  }
}

export async function addUserToGroup(userId: string, groupId: string): Promise<boolean> {
  const token = await getAdminToken();
  if (!token) return false;
  return kcFetch(`/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupId)}`, { method: "PUT", token });
}

export async function removeUserFromGroup(userId: string, groupId: string): Promise<boolean> {
  const token = await getAdminToken();
  if (!token) return false;
  return kcFetch(`/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupId)}`, { method: "DELETE", token });
}

interface KcGroup { id: string; name: string; path?: string }

const UUID_RE = /^[0-9a-fA-F-]{32,}$/;
const groupNameCache = new Map<string,string>(); // name -> id

async function fetchGroupIdByName(name: string): Promise<string | null> {
  if (!name) return null;
  const cached = groupNameCache.get(name);
  if (cached) return cached;
  const token = await getAdminToken();
  if (!token) return null;
  try {
    const url = `${EFFECTIVE_BASE_URL}/admin/realms/${encodeURIComponent(EFFECTIVE_REALM)}/groups?search=${encodeURIComponent(name)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!resp.ok) {
      debug("Gruppen-Suche fehlgeschlagen", { status: resp.status, name });
      return null;
    }
    const arr = await resp.json() as KcGroup[];
    const exact = arr.find(g => g.name === name) || arr.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (exact) {
      groupNameCache.set(name, exact.id);
      return exact.id;
    }
    debug("Keine Gruppe gefunden für Name", { name });
    return null;
  } catch (e) {
    debug("Exception Gruppen-Suche", { name, e });
    return null;
  }
}

async function normalizeGroupIdentifier(raw: string | null | undefined): Promise<{ id: string | null; source: 'uuid' | 'name' | 'none'; raw: string | null | undefined }> {
  if (!raw) return { id: null, source: 'none', raw };
  if (UUID_RE.test(raw)) return { id: raw, source: 'uuid', raw };
  const resolved = await fetchGroupIdByName(raw);
  return { id: resolved, source: 'name', raw };
}

export interface GroupSyncResult {
  added?: boolean;
  removed?: boolean;
  skippedReason?: string;
  envIncomplete?: boolean;
  oldResolved?: { id: string | null; source: string; raw: string | null | undefined };
  newResolved?: { id: string | null; source: string; raw: string | null | undefined };
}

function envIncomplete(): boolean {
  return !(EFFECTIVE_BASE_URL && EFFECTIVE_REALM && CLIENT_ID && CLIENT_SECRET);
}

export async function syncUserGroupChange(params: {
  keycloakUserId: string | null | undefined;
  oldGroupKcId: string | null | undefined; // kann Name oder UUID sein
  newGroupKcId: string | null | undefined; // kann Name oder UUID sein
}): Promise<GroupSyncResult> {
  const { keycloakUserId, oldGroupKcId, newGroupKcId } = params;
  if (!keycloakUserId) return { skippedReason: "Kein Keycloak User" };
  if (oldGroupKcId === newGroupKcId) return { skippedReason: "Keine Änderung" };
  if (envIncomplete()) return { skippedReason: "ENV unvollständig", envIncomplete: true };

  const oldRes = await normalizeGroupIdentifier(oldGroupKcId);
  const newRes = await normalizeGroupIdentifier(newGroupKcId);

  if (!oldRes.id && !newRes.id) {
    return { skippedReason: "Keine gültigen Gruppen-IDs", oldResolved: oldRes, newResolved: newRes };
  }

  const result: GroupSyncResult = { oldResolved: oldRes, newResolved: newRes };
  if (oldRes.id) {
    result.removed = await removeUserFromGroup(keycloakUserId, oldRes.id);
  }
  if (newRes.id) {
    result.added = await addUserToGroup(keycloakUserId, newRes.id);
  }
  debug("Sync Result", { keycloakUserId, oldGroupKcId, newGroupKcId, oldRes, newRes, result });
  return result;
}
