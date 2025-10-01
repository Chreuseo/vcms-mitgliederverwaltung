import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";

interface ExtendedJWT extends JWT { user?: { roles?: string[]; [k: string]: unknown } }

const ROLE = process.env.MITGLIEDER_VERWALTUNG_ROLE || "";

export async function authorizeMitglieder(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number; message: string }>{
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = await getToken({ req, secret }) as ExtendedJWT | null;
  if (!token) return { ok: false, status: 401, message: "Nicht eingeloggt" };
  const roles: string[] = token.user?.roles || [];
  if (!ROLE) return { ok: false, status: 500, message: "Rollen-Variable fehlt" };
  if (!roles.includes(ROLE)) return { ok: false, status: 403, message: "Fehlende Rolle" };
  return { ok: true };
}

