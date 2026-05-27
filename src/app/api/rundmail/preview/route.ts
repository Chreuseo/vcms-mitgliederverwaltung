import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRundmail } from "@/lib/mitglieder/auth";
import { parseMitgliederFiltersFromSearchParams } from "@/lib/mitglieder/filters";
import { findRundmailRecipients } from "@/lib/rundmail/recipients";

export async function GET(req: NextRequest) {
  const auth = await authorizeRundmail(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);

  try {
    const filters = parseMitgliederFiltersFromSearchParams(searchParams);
    const [preview, statusOptions, groupOptions] = await Promise.all([
      findRundmailRecipients(filters, searchParams.get("excludeRegex")),
      prisma.baseStatus.findMany({ select: { bezeichnung: true, beschreibung: true }, orderBy: { bezeichnung: "asc" } }),
      prisma.baseGruppe.findMany({ select: { bezeichnung: true, beschreibung: true }, orderBy: { bezeichnung: "asc" } }),
    ]);

    return NextResponse.json({
      ...preview,
      statusOptions,
      groupOptions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
