import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EDITABLE_FIELDS, DATE_FIELDS, BOOLEAN_FIELDS, INT_FIELDS } from "@/lib/mitglieder/constants";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";
import type { Field } from "@/lib/mitglieder/constants";
import { syncUserGroupChange } from "@/lib/keycloak/groups";

function parseId(param: string | null): number | null {
  if (!param) return null;
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const auth = await authorizeMitglieder(req);
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
  const auth = await authorizeMitglieder(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const id = parseId(idParam);
  if (!id) return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });

  // Alte Person laden um Gruppenänderung zu erkennen
  const previous = await prisma.basePerson.findUnique({ where: { id }, select: { gruppe: true, keycloak_id: true } });
  if (!previous) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 }); }
  if (typeof raw !== "object" || raw == null) return NextResponse.json({ error: "Body muss Objekt sein" }, { status: 400 });

  const incoming = raw as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};

  for (const key of Object.keys(incoming)) {
    if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) continue;
    const field = key as Field;
    const value = incoming[field];

    if (DATE_FIELDS.has(field)) {
      if (typeof value === "string" && value) {
        const d = new Date(value);
        updateData[field] = isNaN(d.getTime()) ? null : d;
      } else if (value instanceof Date) {
        updateData[field] = value;
      } else if (value == null || value === "") {
        updateData[field] = null;
      }
      continue;
    }

    if (BOOLEAN_FIELDS.has(field)) {
      if (typeof value === "boolean") updateData[field] = value; else if (typeof value === "string") updateData[field] = value === "true";
      continue;
    }

    if (INT_FIELDS.has(field)) {
      if (value == null || value === "") updateData[field] = null; else {
        const n = typeof value === "number" ? value : parseInt(String(value), 10);
        updateData[field] = Number.isNaN(n) ? null : n;
      }
      continue;
    }

    switch (field) {
      case "gruppe":
        updateData.gruppe = value == null || value === "" ? undefined : String(value).slice(0,1);
        break;
      case "status":
        updateData.status = value == null || value === "" ? null : String(value);
        break;
      default:
        updateData[field] = value == null || value === "" ? null : String(value);
    }
  }

  if (!Object.keys(updateData).length) return NextResponse.json({ error: "Keine gültigen Felder" }, { status: 400 });

  let groupSync: unknown = undefined;

  try {
    const updated = await prisma.basePerson.update({ where: { id }, data: updateData });

    // Gruppenwechsel prüfen und Keycloak synchronisieren
    let groupSyncDebug: any = undefined;
    if (Object.prototype.hasOwnProperty.call(updateData, "gruppe")) {
      const newGroup = updateData.gruppe as string | undefined; // kann undefined sein wenn leer
      const oldGroup = previous.gruppe;
      if (newGroup && newGroup !== oldGroup) {
        // Beide Gruppen-Records laden um an beschreibung (Keycloak Group ID) zu kommen
        const gruppen = await prisma.baseGruppe.findMany({
          where: { bezeichnung: { in: [oldGroup, newGroup] } },
          select: { bezeichnung: true, beschreibung: true },
        });
        const map = new Map(gruppen.map(g => [g.bezeichnung, g.beschreibung]));
        const oldKc = map.get(oldGroup) || null;
        const newKc = map.get(newGroup) || null;
        if (process.env.KEYCLOAK_GROUP_SYNC_DEBUG === "1") {
          groupSyncDebug = { oldGroup, newGroup, oldKc, newKc };
          // eslint-disable-next-line no-console
          console.log("[kc-group-sync] Wechsel", groupSyncDebug);
        }
        try {
          groupSync = await syncUserGroupChange({
            keycloakUserId: updated.keycloak_id,
            oldGroupKcId: oldKc,
            newGroupKcId: newKc,
          });
        } catch (e) {
          groupSync = { error: "Keycloak Sync Fehler", detail: e instanceof Error ? e.message : String(e) };
        }
      } else if (process.env.KEYCLOAK_GROUP_SYNC_DEBUG === "1") {
        groupSyncDebug = { skipped: true, reason: newGroup === oldGroup ? "unchanged" : "empty newGroup", oldGroup, newGroup };
      }
    }

    return NextResponse.json({ data: updated, groupSync, groupSyncDebug });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Record to update not found")) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json({ error: "DB Fehler", detail: msg }, { status: 500 });
  }
}
