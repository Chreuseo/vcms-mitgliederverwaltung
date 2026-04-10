import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";
import { createUser, deleteUser, fetchUsersBatch, updateUserAttributes, updateUserEmail } from "@/lib/keycloak/users";
import { makePlaceholderEmail } from "@/lib/mitglieder/emailPlaceholder";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorizeMitglieder(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  // 1) Personen mit Keycloak-ID: lokale Email -> Keycloak Sync
  const personsWithKc = await prisma.basePerson.findMany({
    where: { keycloak_id: { not: null } },
    select: {
      id: true,
      email: true,
      vorname: true,
      name: true,
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
  for (const p of personsWithKc) {
    if (p.keycloak_id) { kcIds.push(p.keycloak_id); idMap[p.keycloak_id] = p.id; }
  }
  const users = await fetchUsersBatch(kcIds);

  const updates: { id: number; oldEmail: string | null; newEmail: string; skipped?: string }[] = [];
  let updatedCount = 0;
  let attributesUpdated = 0;
  let dummyEmailsSet = 0;
  let usersCreated = 0;

  for (const kcId of kcIds) {
    const user = users[kcId];
    const personId = idMap[kcId];
    const p = personsWithKc.find((pp: (typeof personsWithKc)[number]) => pp.id === personId)!;
    if (!user) { updates.push({ id: personId, oldEmail: p.email, newEmail: "", skipped: "User nicht gefunden" }); continue; }

    const kcEmail = (user.email || "").trim();
    const localEmail = (p.email || "").trim();

    // Zieladresse fuer den Keycloak-User. In diesem Endpoint wird die DB-Email NICHT zurueckgeschrieben.
    const targetKeycloakEmail = localEmail || kcEmail || makePlaceholderEmail({
      vorname: p.vorname,
      nachname: p.name,
      id: p.id,
      domain: process.env.MAIL_PLACEHOLDER_DOMAIN,
    });

    if (targetKeycloakEmail !== kcEmail) {
      const r = await updateUserEmail(kcId, {
        email: targetKeycloakEmail,
        username: targetKeycloakEmail,
        firstName: p.vorname,
        lastName: p.name,
      });
      if (r.ok) {
        updatedCount++;
        if (!localEmail) dummyEmailsSet++;
        updates.push({ id: personId, oldEmail: kcEmail || null, newEmail: targetKeycloakEmail });
      } else {
        updates.push({
          id: personId,
          oldEmail: kcEmail || null,
          newEmail: targetKeycloakEmail,
          skipped: r.status === 409 ? "Keycloak Konflikt (409)" : (r.error || "Keycloak Update fehlgeschlagen"),
        });
      }
    }

    // Lokale Felder -> Keycloak-Attribute schreiben
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

  // 2) Personen ohne Keycloak-ID: KC User anlegen (Dummy-Email falls nötig)
  const personsWithoutKc = await prisma.basePerson.findMany({
    where: { keycloak_id: null },
    select: { id: true, email: true, vorname: true, name: true },
  });

  for (const p of personsWithoutKc) {
    const email = (p.email || "").trim() || makePlaceholderEmail({ vorname: p.vorname, nachname: p.name, id: p.id, domain: process.env.MAIL_PLACEHOLDER_DOMAIN });
    const kc = await createUser({ email, firstName: p.vorname ?? undefined, lastName: p.name ?? undefined });
    if (kc.error || !kc.id) {
      updates.push({ id: p.id, oldEmail: p.email, newEmail: email, skipped: `Keycloak Create fehlgeschlagen: ${kc.error || "unbekannt"}` });
      continue;
    }

    try {
      await prisma.basePerson.update({ where: { id: p.id }, data: { keycloak_id: kc.id } });
      usersCreated++;
      if (!(p.email || "").trim()) dummyEmailsSet++; // Dummy wurde für Create verwendet
      updates.push({ id: p.id, oldEmail: p.email, newEmail: email });
    } catch (e) {
      // DB failed -> cleanup KC
      await deleteUser(kc.id);
      updates.push({ id: p.id, oldEmail: p.email, newEmail: email, skipped: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    total: personsWithKc.length + personsWithoutKc.length,
    attempted: kcIds.length,
    usersCreated,
    updated: updatedCount,
    dummyEmailsSet,
    changes: updates,
    attributesUpdated,
  });
}
