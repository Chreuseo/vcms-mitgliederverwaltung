import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALL_FIELDS, DEFAULT_LIST_FIELDS, EDITABLE_FIELDS, DATE_FIELDS, BOOLEAN_FIELDS, INT_FIELDS } from "@/lib/mitglieder/constants";
import type { Field } from "@/lib/mitglieder/constants";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";
import { createUser, deleteUser } from "@/lib/keycloak/users";
import { makePlaceholderEmail } from "@/lib/mitglieder/emailPlaceholder";

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

  const vornameDraft = typeof body.vorname === "string" ? body.vorname.trim() || undefined : undefined;
  const nameDraft = typeof body.name === "string" ? body.name.trim() || undefined : undefined;

  // Email ist optional: wenn leer, wird ein Dummy für Keycloak erzeugt.
  const emailInput = typeof body.email === "string" ? body.email.trim() : "";

  // Datenobjekt aufbauen – analog zur bisherigen Logik
  const data: Record<string, unknown> = {};
  // Email nur setzen, wenn vorhanden (sonst bleibt sie null in der DB)
  if (emailInput) data.email = emailInput;

  for (const key of EDITABLE_FIELDS) {
    if (key === "id" || key === "leibmitglied" || key === "email" || key === "keycloak_id") continue; // ausgeschlossen / separat
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      if (key === "hausvereinsmitglied") data.hausvereinsmitglied = false; // Default false statt null
      continue;
    }
    const value = (body as Record<string, unknown>)[key];

    if (DATE_FIELDS.has(key)) {
      if (typeof value === "string" && value) {
        const d = new Date(value);
        data[key] = isNaN(d.getTime()) ? null : d;
      } else if (value instanceof Date) {
        data[key] = value;
      } else if (value == null || value === "") {
        data[key] = null;
      }
      continue;
    }

    if (BOOLEAN_FIELDS.has(key)) {
      if (typeof value === "boolean") data[key] = value; else if (typeof value === "string") data[key] = value === "true"; else data[key] = false;
      continue;
    }

    if (INT_FIELDS.has(key)) {
      if (value == null || value === "") data[key] = null; else {
        const n = typeof value === "number" ? value : parseInt(String(value), 10);
        data[key] = Number.isNaN(n) ? null : n;
      }
      continue;
    }

    switch (key) {
      case "gruppe":
        data.gruppe = value == null || value === "" ? undefined : String(value).slice(0, 1);
        break;
      case "status":
        data.status = value == null || value === "" ? null : String(value);
        break;
      default:
        data[key] = value == null || value === "" ? null : String(value);
    }
  }

  if (typeof data.hausvereinsmitglied === "undefined") data.hausvereinsmitglied = false;

  // Fall A: Email vorhanden -> wie bisher, Keycloak zuerst.
  if (emailInput) {
    const kc = await createUser({ email: emailInput, firstName: vornameDraft, lastName: nameDraft });
    if (kc.error || !kc.id) {
      return NextResponse.json({ error: "Keycloak User Erstellung fehlgeschlagen", detail: kc.error }, { status: 502 });
    }

    data.keycloak_id = kc.id;

    let created: unknown;
    try {
      created = await prisma.basePerson.create({ data });
    } catch (e: unknown) {
      await deleteUser(kc.id);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint failed") || msg.toLowerCase().includes("unique")) {
        return NextResponse.json({ error: "Email bereits vorhanden" }, { status: 409 });
      }
      return NextResponse.json({ error: "DB Fehler", detail: msg }, { status: 500 });
    }
    return NextResponse.json({ data: created, keycloak: { id: kc.id, created: kc.created } }, { status: 201 });
  }

  // Fall B: keine Email -> zuerst DB anlegen, damit wir eine ID für eine stabile Dummy-Mail haben.
  let createdPerson: { id: number };
  try {
    createdPerson = await prisma.basePerson.create({ data, select: { id: true } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "DB Fehler", detail: msg }, { status: 500 });
  }

  let placeholderEmail: string;
  try {
    placeholderEmail = makePlaceholderEmail({ vorname: vornameDraft, nachname: nameDraft, id: createdPerson.id });
  } catch (e: unknown) {
    // Aufräumen: Person wieder löschen, wenn ENV fehlt o.ä.
    await prisma.basePerson.delete({ where: { id: createdPerson.id } }).catch(() => undefined);
    return NextResponse.json({ error: "Dummy-Email konnte nicht generiert werden", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const kc = await createUser({ email: placeholderEmail, firstName: vornameDraft, lastName: nameDraft });
  if (kc.error || !kc.id) {
    // Rollback DB, da wir die Person ohne Keycloak nicht stehen lassen wollen
    await prisma.basePerson.delete({ where: { id: createdPerson.id } }).catch(() => undefined);
    return NextResponse.json({ error: "Keycloak User Erstellung fehlgeschlagen", detail: kc.error }, { status: 502 });
  }

  try {
    const updated = await prisma.basePerson.update({ where: { id: createdPerson.id }, data: { keycloak_id: kc.id } });
    return NextResponse.json({ data: updated, keycloak: { id: kc.id, created: kc.created }, placeholderEmail }, { status: 201 });
  } catch (e: unknown) {
    // Rollback: Keycloak-User löschen + DB-Record löschen
    await deleteUser(kc.id);
    await prisma.basePerson.delete({ where: { id: createdPerson.id } }).catch(() => undefined);
    return NextResponse.json({ error: "DB Fehler", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
