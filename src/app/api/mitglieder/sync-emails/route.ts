import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";
import { fetchUsersBatch, updateUserAttributes } from "@/lib/keycloak/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorizeMitglieder(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const persons = await prisma.basePerson.findMany({
    where: { keycloak_id: { not: null } },
    select: {
      id: true,
      email: true,
      keycloak_id: true,
      strasse1: true,
      plz1: true,
      ort1: true,
      status: true,
      hausvereinsmitglied: true,
    },
  });
  const idMap: Record<string, number> = {};
  const kcIds: string[] = [];
  for (const p of persons) {
    if (p.keycloak_id) { kcIds.push(p.keycloak_id); idMap[p.keycloak_id] = p.id; }
  }
  const users = await fetchUsersBatch(kcIds);

  const updates: { id: number; oldEmail: string | null; newEmail: string; skipped?: string }[] = [];
  let updatedCount = 0;
  let attributesUpdated = 0;
  for (const kcId of kcIds) {
    const user = users[kcId];
    const personId = idMap[kcId];
    const p = persons.find(pp => pp.id === personId)!;
    if (!user) { updates.push({ id: personId, oldEmail: p.email, newEmail: "", skipped: "User nicht gefunden" }); continue; }

    // Email aus Keycloak nach lokal synchronisieren
    const kcEmail = (user.email || "").trim();
    if (!kcEmail) { updates.push({ id: personId, oldEmail: p.email, newEmail: "", skipped: "KC Email leer" }); }
    else if (p.email !== kcEmail) {
      // Versuche Update – kann wegen Unique Constraint fehlschlagen
      try {
        await prisma.basePerson.update({ where: { id: personId }, data: { email: kcEmail } });
        updates.push({ id: personId, oldEmail: p.email, newEmail: kcEmail });
        updatedCount++;
      } catch {
        updates.push({ id: personId, oldEmail: p.email, newEmail: kcEmail, skipped: "Unique Konflikt" });
      }
    }

    // Lokale Felder -> Keycloak-Attribute schreiben (überschreiben)
    const trimOrNull = (v: string | null | undefined) => {
      const s = (v ?? "").toString().trim();
      return s.length ? s : null;
    };
    const hvValue = p.hausvereinsmitglied == null ? null : (p.hausvereinsmitglied ? 1 : 0);
    const attrPayload: Record<string, string | number | null> = {
      strasse: trimOrNull(p.strasse1),
      plz: trimOrNull(p.plz1),
      ort: trimOrNull(p.ort1),
      status: trimOrNull(p.status),
      "hv-mitglied": hvValue,
    };
    const attrResult = await updateUserAttributes(kcId, attrPayload);
    if (attrResult.ok) attributesUpdated++;
  }
  return NextResponse.json({ total: persons.length, attempted: kcIds.length, updated: updatedCount, changes: updates, attributesUpdated });
}
