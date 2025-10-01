// typescript
import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth, { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import type { User } from "next-auth";
import type { JWT } from "next-auth/jwt";

const {
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET,
    KEYCLOAK_ISSUER: RAW_ISSUER,
    NEXTAUTH_SECRET,
} = process.env;

function sanitizeIssuer(raw: string | undefined): string | null {
    if (!raw) return null;
    const first = raw.split(/\s+/)[0].trim();
    if (!first) return null;
    return first.replace(/\/$/, "");
}

async function validateDiscovery(issuerBase: string) {
    const wellKnown = `${issuerBase}/.well-known/openid-configuration`;
    let res: Response;
    try {
        res = await fetch(wellKnown);
    } catch (e: unknown) {
        throw new Error(`Failed to fetch ${wellKnown}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
        const body = await res.text().then((t) => t.slice(0, 400));
        throw new Error(`OIDC discovery returned ${res.status}: ${body}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const body = await res.text().then((t) => t.slice(0, 400));
        throw new Error(`OIDC discovery did not return JSON (content-type=${ct}) body=${body}`);
    }
    await res.json();
}

function decode(token: string): unknown {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString());
    } catch {
        return {};
    }
}

interface KeycloakDecodedToken {
  sub?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, unknown>;
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email_verified?: boolean;
}

interface KeycloakSessionUser extends User {
  sub?: string;
  roles: string[];
  realm_access: Record<string, unknown>;
  resource_access: Record<string, unknown>;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  email_verified?: boolean;
}

interface MutableToken extends JWT {
  accessToken?: string;
  user?: KeycloakSessionUser;
}

declare module "next-auth" {
  interface Session {
    token?: string;
    user?: KeycloakSessionUser;
  }
}

function buildAuthOptions(issuerBase: string): NextAuthOptions {
  return {
        providers: [
            KeycloakProvider({
                clientId: KEYCLOAK_CLIENT_ID!,
                clientSecret: KEYCLOAK_CLIENT_SECRET!,
                issuer: issuerBase,
            }),
        ],
        secret: NEXTAUTH_SECRET,
        session: {
            strategy: "jwt",
            maxAge: 30 * 24 * 60 * 60, // 30 Tage
        },
        jwt: {},
        callbacks: {
            async jwt({ token, user, account }) {
                if (account?.access_token) {
                    const decoded = decode(account.access_token) as KeycloakDecodedToken;
                    const mt = token as MutableToken;
                    const baseUser: Partial<User> = user ?? {};
                    mt.accessToken = account.access_token;
                    mt.user = {
                        ...(baseUser as User),
                        sub: decoded.sub,
                        roles: decoded.realm_access?.roles ?? [],
                        realm_access: decoded.realm_access ?? {},
                        resource_access: decoded.resource_access ?? {},
                        preferred_username: decoded.preferred_username,
                        email: decoded.email ?? baseUser.email,
                        name: decoded.name ?? baseUser.name ?? undefined,
                        given_name: decoded.given_name,
                        family_name: decoded.family_name,
                        email_verified: decoded.email_verified,
                    };
                }
                return token;
            },
            async session({ session, token }) {
                const mt = token as MutableToken;
                if (mt.user) session.user = mt.user;
                if (mt.accessToken) session.token = mt.accessToken;
                return session;
            },
        },
        pages: { signIn: "/auth/signin" },
  };
}

export default async function auth(req: NextApiRequest, res: NextApiResponse) {
    if (!KEYCLOAK_CLIENT_ID || !KEYCLOAK_CLIENT_SECRET || !RAW_ISSUER || !NEXTAUTH_SECRET) {
        console.error("Missing required env vars for NextAuth.");
        return res.status(500).json({ error: "Missing required server environment variables." });
    }

    const issuer = sanitizeIssuer(RAW_ISSUER);
    if (!issuer) {
        console.error("KEYCLOAK_ISSUER seems empty or invalid.");
        return res.status(500).json({ error: "Invalid KEYCLOAK_ISSUER." });
    }

    try {
        await validateDiscovery(issuer);
    } catch (e: unknown) {
        console.error("Keycloak OIDC discovery failed:", e);
        return res.status(500).json({
            error: `Failed to fetch Keycloak OIDC discovery at ${issuer}: ${e instanceof Error ? e.message : String(e)}`,
        });
    }

    const authOptions = buildAuthOptions(issuer);
    return NextAuth(req, res, authOptions);
}