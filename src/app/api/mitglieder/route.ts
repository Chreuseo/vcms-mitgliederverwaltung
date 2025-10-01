import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALL_FIELDS, DEFAULT_LIST_FIELDS } from "@/lib/mitglieder/constants";
import type { Field } from "@/lib/mitglieder/constants";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";
import { createUser, deleteUser } from "@/lib/keycloak/users";

// Stelle sicher, dass "vorname" immer in der Abfrage enthalten ist
function parseFieldsParam(param: string | null): Field[] {
  if (!param) return DEFAULT_LIST_FIELDS as Field[];
  const requested = param.split(",").map(p => p.trim()).filter(Boolean);
  const valid: Field[] = [];
  for (const f of requested) {
    if ((ALL_FIELDS as readonly string[]).includes(f)) valid.push(f as Field);
  }
  if (!valid.includes("id" as Field)) valid.unshift("id" as Field);
  if (!valid.includes("vorname" as Field)) valid.push("vorname" as Field);
  return valid.length ? valid : (DEFAULT_LIST_FIELDS as Field[]);
}

function parseMulti(param: string | null): string[] | undefined {
  if (!param) return undefined;
  const arr = param.split(",").map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

async function authorize(req: NextRequest) { return authorizeMitglieder(req); }

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { searchParams } = new URL(req.url);
  const fields = parseFieldsParam(searchParams.get("fields"));
  const select: Record<string, true> = Object.fromEntries(fields.map(f => [f, true])) as Record<string, true>;

  const gruppeFilter = parseMulti(searchParams.get("gruppe"));
  const statusFilter = parseMulti(searchParams.get("status"));
  const hvm = searchParams.get("hvm");
  const wantMeta = searchParams.get("meta") === "1";

  const where: Record<string, unknown> = {};
  if (gruppeFilter) where.gruppe = { in: gruppeFilter.map(g => g.slice(0,1)) };
  if (statusFilter) where.status = { in: statusFilter };
  if (hvm === "yes") where.hausvereinsmitglied = true; else if (hvm === "no") where.hausvereinsmitglied = false;

  try {
    const dataPromise = prisma.basePerson.findMany({ select, where, orderBy: { id: "asc" } });
    if (wantMeta) {
      const [data, statusOptions, groupOptions] = await Promise.all([
        dataPromise,
        prisma.baseStatus.findMany({ select: { bezeichnung: true, beschreibung: true }, orderBy: { bezeichnung: "asc" } }),
        prisma.baseGruppe.findMany({ select: { bezeichnung: true, beschreibung: true }, orderBy: { bezeichnung: "asc" } }),
      ]);
      return NextResponse.json({ fields, data, statusOptions, groupOptions });
    } else {
      const data = await dataPromise;
      return NextResponse.json({ fields, data });
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: "DB Fehler", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 }); }
  if (typeof raw !== "object" || raw == null) return NextResponse.json({ error: "Body muss Objekt sein" }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "Email erforderlich" }, { status: 400 });

  // Optionale Felder
  const vorname = typeof body.vorname === "string" ? body.vorname.trim() || null : null;
  const name = typeof body.name === "string" ? body.name.trim() || null : null;
  const gruppeRaw = typeof body.gruppe === "string" ? body.gruppe.trim() : "";
  const gruppe = gruppeRaw ? gruppeRaw.slice(0,1) : undefined; // default handled by schema
  const status = typeof body.status === "string" ? body.status.trim() || null : null;
  const hausvereinsmitglied = typeof body.hausvereinsmitglied === "boolean" ? body.hausvereinsmitglied : undefined;

  // Erstelle zuerst Keycloak User
  const kc = await createUser({ email, firstName: vorname || undefined, lastName: name || undefined });
  if (kc.error || !kc.id) {
    return NextResponse.json({ error: "Keycloak User Erstellung fehlgeschlagen", detail: kc.error }, { status: 502 });
  }
  let created: unknown;
  try {
    created = await prisma.basePerson.create({ data: { email, vorname, name, gruppe, status, hausvereinsmitglied, keycloak_id: kc.id } });
  } catch (e: unknown) {
    // Rollback Keycloak User falls DB Fehler
    await deleteUser(kc.id);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint failed") || msg.includes("unique")) {
      return NextResponse.json({ error: "Email bereits vorhanden" }, { status: 409 });
    }
    return NextResponse.json({ error: "DB Fehler", detail: msg }, { status: 500 });
  }
  return NextResponse.json({ data: created, keycloak: { id: kc.id, created: kc.created } }, { status: 201 });
}
