import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

interface ExtendedJWT extends JWT { user?: { roles?: string[]; [k: string]: unknown } }

const ROLE = process.env.MITGLIEDER_VERWALTUNG_ROLE || "";

const EDITABLE_FIELDS = [
  "anrede","titel","rang","vorname","praefix","name","suffix","geburtsname","zusatz1","strasse1","ort1","plz1","land1","telefon1","datum_adresse1_stand","zusatz2","strasse2","ort2","plz2","land2","telefon2","datum_adresse2_stand","region1","region2","mobiltelefon","email","skype","webseite","datum_geburtstag","beruf","heirat_partner","heirat_datum","tod_datum","tod_ort","gruppe","datum_gruppe_stand","status","semester_reception","semester_promotion","semester_philistrierung","semester_aufnahme","semester_fusion","austritt_datum","spitzname","anschreiben_zusenden","spendenquittung_zusenden","vita","bemerkung","password_hash","validationkey","keycloak_id","hausvereinsmitglied"
] as const;

async function authorize(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = await getToken({ req, secret }) as ExtendedJWT | null;
  if (!token) return { ok: false, status: 401, message: "Nicht eingeloggt" } as const;
  const roles: string[] = token.user?.roles || [];
  if (!ROLE) return { ok: false, status: 500, message: "Rollen-Variable fehlt" } as const;
  if (!roles.includes(ROLE)) return { ok: false, status: 403, message: "Fehlende Rolle" } as const;
  return { ok: true } as const;
}

function parseId(param: string | null): number | null {
  if (!param) return null;
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const id = parseId(idParam);
  if (!id) return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  try {
    const [person, statusOptions, groupOptions] = await Promise.all([
      prisma.basePerson.findUnique({ where: { id } }),
      prisma.baseStatus.findMany({ select: { bezeichnung: true, beschreibung: true }, orderBy: { bezeichnung: "asc" } }),
      prisma.baseGruppe.findMany({ select: { bezeichnung: true, beschreibung: true }, orderBy: { bezeichnung: "asc" } }),
    ]);
    if (!person) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json({ data: person, editable: EDITABLE_FIELDS, statusOptions, groupOptions });
  } catch (e: unknown) {
    return NextResponse.json({ error: "DB Fehler", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const id = parseId(idParam);
  if (!id) return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }
  if (typeof raw !== "object" || raw == null) {
    return NextResponse.json({ error: "Body muss Objekt sein" }, { status: 400 });
  }

  const incoming = raw as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};

  const DATE_FIELDS = new Set([
    "datum_adresse1_stand","datum_adresse2_stand","datum_geburtstag","heirat_datum","tod_datum","datum_gruppe_stand","austritt_datum"
  ]);
  const BOOLEAN_FIELDS = new Set([
    "anschreiben_zusenden","spendenquittung_zusenden","hausvereinsmitglied"
  ]);
  const INT_FIELDS = new Set([
    "region1","region2","heirat_partner"
  ]);

  for (const key of Object.keys(incoming)) {
    if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) continue;
    const value = incoming[key];

    if (DATE_FIELDS.has(key)) {
      if (typeof value === "string" && value) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) updateData[key] = d; else updateData[key] = null;
      } else if (value instanceof Date) {
        updateData[key] = value;
      } else if (value == null || value === "") {
        updateData[key] = null;
      }
      continue;
    }

    if (BOOLEAN_FIELDS.has(key)) {
      if (typeof value === "boolean") updateData[key] = value;
      else if (typeof value === "string") updateData[key] = value === "true";
      continue;
    }

    if (INT_FIELDS.has(key)) {
      if (value == null || value === "") { updateData[key] = null; }
      else {
        const n = typeof value === "number" ? value : parseInt(String(value),10);
        updateData[key] = Number.isNaN(n) ? null : n;
      }
      continue;
    }

    switch (key) {
      case "gruppe":
        if (value == null || value === "") updateData.gruppe = undefined; else updateData.gruppe = String(value).slice(0,1);
        break;
      case "status":
        updateData.status = value == null || value === "" ? null : String(value);
        break;
      default:
        updateData[key] = value == null || value === "" ? null : String(value);
    }
  }

  if (!Object.keys(updateData).length) {
    return NextResponse.json({ error: "Keine gültigen Felder" }, { status: 400 });
  }
  try {
    const updated = await prisma.basePerson.update({ where: { id }, data: updateData });
    return NextResponse.json({ data: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Record to update not found")) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json({ error: "DB Fehler", detail: msg }, { status: 500 });
  }
}
