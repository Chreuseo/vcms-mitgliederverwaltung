import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";
import { fetchUsersBatch } from "@/lib/keycloak/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authorizeMitglieder(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const persons = await prisma.basePerson.findMany({ where: { keycloak_id: { not: null } }, select: { id: true, email: true, keycloak_id: true } });
  const idMap: Record<string, number> = {};
  const kcIds: string[] = [];
  for (const p of persons) {
    if (p.keycloak_id) { kcIds.push(p.keycloak_id); idMap[p.keycloak_id] = p.id; }
  }
  const users = await fetchUsersBatch(kcIds);

  const updates: { id: number; oldEmail: string | null; newEmail: string; skipped?: string }[] = [];
  let updatedCount = 0;
  for (const kcId of kcIds) {
    const user = users[kcId];
    const personId = idMap[kcId];
    if (!user) { updates.push({ id: personId, oldEmail: persons.find(p=>p.id===personId)!.email, newEmail: "", skipped: "User nicht gefunden" }); continue; }
    const kcEmail = (user.email || "").trim();
    if (!kcEmail) { updates.push({ id: personId, oldEmail: persons.find(p=>p.id===personId)!.email, newEmail: "", skipped: "KC Email leer" }); continue; }
    const currentEmail = persons.find(p=>p.id===personId)!.email;
    if (currentEmail === kcEmail) continue;
    // Versuche Update – kann wegen Unique Constraint fehlschlagen
    try {
      await prisma.basePerson.update({ where: { id: personId }, data: { email: kcEmail } });
      updates.push({ id: personId, oldEmail: currentEmail, newEmail: kcEmail });
      updatedCount++;
    } catch {
      updates.push({ id: personId, oldEmail: currentEmail, newEmail: kcEmail, skipped: "Unique Konflikt" });
    }
  }
  return NextResponse.json({ total: persons.length, attempted: kcIds.length, updated: updatedCount, changes: updates });
}
