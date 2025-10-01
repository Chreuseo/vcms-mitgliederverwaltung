import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

interface ExtendedJWT extends JWT { user?: { roles?: string[]; [k: string]: unknown } }

const ROLE = process.env.MITGLIEDER_VERWALTUNG_ROLE || "";

const EDITABLE_FIELDS = [
  "anrede","vorname","name","strasse1","plz1","ort1","datum_geburtstag","email","telefon1","mobiltelefon","gruppe","status","bemerkung"
] as const;

type EditableField = typeof EDITABLE_FIELDS[number];

type ReqLike = Pick<NextRequest, "cookies" | "headers"> & { [k: string]: unknown };

async function authorize(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = await getToken({ req: req as unknown as ReqLike, secret }) as ExtendedJWT | null; // Cast auf ReqLike statt any
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  try {
    const person = await prisma.basePerson.findUnique({ where: { id } });
    if (!person) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json({ data: person, editable: EDITABLE_FIELDS });
  } catch (e: unknown) {
    return NextResponse.json({ error: "DB Fehler", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const id = parseId(params.id);
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
  const updateData: Prisma.BasePersonUpdateInput = {};

  for (const key of Object.keys(incoming)) {
    if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) continue;
    const value = incoming[key];
    switch (key as EditableField) {
      case "datum_geburtstag": {
        if (typeof value === "string" && value) {
          const d = new Date(value);
            if (!isNaN(d.getTime())) updateData.datum_geburtstag = d;
          } else if (value instanceof Date) {
            updateData.datum_geburtstag = value;
          } else if (value == null || value === "") {
            updateData.datum_geburtstag = null;
          }
        break;
      }
      case "anrede": updateData.anrede = value == null || value === "" ? null : String(value); break;
      case "vorname": updateData.vorname = value == null || value === "" ? null : String(value); break;
      case "name": updateData.name = value == null || value === "" ? null : String(value); break;
      case "strasse1": updateData.strasse1 = value == null || value === "" ? null : String(value); break;
      case "plz1": updateData.plz1 = value == null || value === "" ? null : String(value); break;
      case "ort1": updateData.ort1 = value == null || value === "" ? null : String(value); break;
      case "email": updateData.email = value == null || value === "" ? null : String(value); break;
      case "telefon1": updateData.telefon1 = value == null || value === "" ? null : String(value); break;
      case "mobiltelefon": updateData.mobiltelefon = value == null || value === "" ? null : String(value); break;
      case "gruppe": updateData.gruppe = value == null || value === "" ? undefined : String(value).slice(0,1); break; // char(1)
      case "status": updateData.status = value == null || value === "" ? null : String(value); break;
      case "bemerkung": updateData.bemerkung = value == null || value === "" ? null : String(value); break;
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
