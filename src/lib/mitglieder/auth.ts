import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";

export interface ExtendedJWT extends JWT {
  user?: {
    roles?: string[];
    sub?: string;
    email?: string | null;
    name?: string | null;
    preferred_username?: string;
    [k: string]: unknown;
  };
}

type AuthFailure = { ok: false; status: number; message: string };
type AuthSuccess = { ok: true; token: ExtendedJWT; roles: string[] };

const MITGLIEDER_ROLE = process.env.MITGLIEDER_VERWALTUNG_ROLE || "";
const RUNDMAIL_ROLES_RAW = process.env.RUNDMAIL_ROLES || "";

function parseAllowedRoles(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((role) => role.trim())
    .filter(Boolean);
}

async function getAuthContext(req: NextRequest): Promise<AuthSuccess | AuthFailure> {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = (await getToken({ req, secret })) as ExtendedJWT | null;
  if (!token) return { ok: false, status: 401, message: "Nicht eingeloggt" };

  return { ok: true, token, roles: token.user?.roles || [] };
}

function authorizeRoles(roles: string[], allowedRoles: string[], missingRoleMessage: string): { ok: true } | AuthFailure {
  if (!allowedRoles.length) return { ok: false, status: 500, message: missingRoleMessage };
  if (!allowedRoles.some((role) => roles.includes(role))) {
    return { ok: false, status: 403, message: "Fehlende Rolle" };
  }
  return { ok: true };
}

export async function authorizeMitglieder(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number; message: string }>{
  const auth = await getAuthContext(req);
  if (!auth.ok) return auth;
  const result = authorizeRoles(auth.roles, parseAllowedRoles(MITGLIEDER_ROLE), "Rollen-Variable fehlt");
  if (!result.ok) return result;
  return { ok: true };
}

export async function authorizeRundmail(req: NextRequest): Promise<{ ok: true; token: ExtendedJWT; roles: string[] } | AuthFailure> {
  const auth = await getAuthContext(req);
  if (!auth.ok) return auth;
  const result = authorizeRoles(auth.roles, parseAllowedRoles(RUNDMAIL_ROLES_RAW), "RUNDMAIL_ROLES fehlt oder ist leer");
  if (!result.ok) return result;
  return auth;
}

