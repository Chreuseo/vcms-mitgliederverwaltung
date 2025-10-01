import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

interface ExtendedJWT extends JWT { user?: { roles?: string[]; [k: string]: unknown } }

const ROLE = process.env.MITGLIEDER_VERWALTUNG_ROLE || "";

// Alle Felder des BasePerson Modells (Schema spiegeln)
const ALL_FIELDS = [
  "id","anrede","titel","rang","vorname","praefix","name","suffix","geburtsname","zusatz1","strasse1","ort1","plz1","land1","telefon1","datum_adresse1_stand","zusatz2","strasse2","ort2","plz2","land2","telefon2","datum_adresse2_stand","region1","region2","mobiltelefon","email","skype","webseite","datum_geburtstag","beruf","heirat_partner","heirat_datum","tod_datum","tod_ort","gruppe","datum_gruppe_stand","status","semester_reception","semester_promotion","semester_philistrierung","semester_aufnahme","semester_fusion","austritt_datum","spitzname","leibmitglied","anschreiben_zusenden","spendenquittung_zusenden","vita","bemerkung","password_hash","validationkey","keycloak_id","hausvereinsmitglied"
] as const;

type Field = typeof ALL_FIELDS[number];

const DEFAULT_FIELDS: Field[] = [
  "id","vorname","name","strasse1","plz1","ort1","datum_geburtstag","email"
];

// Stelle sicher, dass "vorname" immer in der Abfrage enthalten ist
function parseFieldsParam(param: string | null): Field[] {
  if (!param) return DEFAULT_FIELDS;
  const requested = param.split(",").map(p => p.trim()).filter(Boolean);
  const valid: Field[] = [];
  for (const f of requested) {
    if ((ALL_FIELDS as readonly string[]).includes(f)) valid.push(f as Field);
  }
  // Immer id und vorname für Links und Anzeige
  if (!valid.includes("id")) valid.unshift("id");
  if (!valid.includes("vorname")) valid.push("vorname");
  return valid.length ? valid : DEFAULT_FIELDS;
}

async function authorize(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = await getToken({ req, secret }) as ExtendedJWT | null; // req Casting entfernt
  if (!token) return { ok: false, status: 401, message: "Nicht eingeloggt" } as const;
  const roles: string[] = token.user?.roles || [];
  if (!ROLE) return { ok: false, status: 500, message: "Rollen-Umgebungsvariable fehlt" } as const;
  if (!roles.includes(ROLE)) return { ok: false, status: 403, message: "Fehlende Rolle" } as const;
  return { ok: true } as const;
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { searchParams } = new URL(req.url);
  const fields = parseFieldsParam(searchParams.get("fields"));
  const select: Record<string, true> = Object.fromEntries(fields.map(f => [f, true])) as Record<string, true>;
  try {
    const data = await prisma.basePerson.findMany({ select, orderBy: { id: "asc" } });
    return NextResponse.json({ fields, data });
  } catch (e: unknown) {
    return NextResponse.json({ error: "DB Fehler", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
