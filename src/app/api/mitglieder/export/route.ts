import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALL_FIELDS, DEFAULT_LIST_FIELDS, FIELD_LABELS } from "@/lib/mitglieder/constants";
import type { Field } from "@/lib/mitglieder/constants";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";

function parseFieldsParam(param: string | null, preset: string | null): Field[] {
  if (param) {
    const requested = param.split(",").map(p => p.trim()).filter(Boolean);
    const valid: Field[] = [];
    for (const f of requested) {
      if ((ALL_FIELDS as readonly string[]).includes(f)) valid.push(f as Field);
    }
    if (!valid.includes("id" as Field)) valid.unshift("id" as Field);
    if (!valid.includes("vorname" as Field)) valid.push("vorname" as Field);
    return valid.length ? valid : (DEFAULT_LIST_FIELDS as Field[]);
  }
  // Falls Felder nicht explizit angegeben wurden, kann ein Preset gewählt sein
  const PRESETS: Record<string, Field[]> = {
    adressliste: ["vorname","name","strasse1","plz1","ort1","land1","telefon1","mobiltelefon","email"] as Field[],
    geburtstage: ["vorname","name","datum_geburtstag","strasse1","plz1","ort1","land1","email","telefon1","mobiltelefon"] as Field[],
    mailliste: ["vorname","name","email"] as Field[],
  };
  if (preset && PRESETS[preset]) {
    const fields = PRESETS[preset];
    // id an den Anfang setzen für Referenz
    return ["id" as Field, ...fields.filter(f => f !== ("id" as Field))];
  }
  return DEFAULT_LIST_FIELDS as Field[];
}

function parseMulti(param: string | null): string[] | undefined {
  if (!param) return undefined;
  const arr = param.split(",").map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

function toCsvCell(value: unknown): string {
  let v: string;
  if (value == null) v = "";
  else if (value instanceof Date) v = value.toISOString();
  else if (typeof value === "boolean") v = value ? "true" : "false";
  else v = String(value);
  // Escaping für CSV
  if (/[",\n\r]/.test(v)) {
    v = '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

async function authorize(req: NextRequest) { return authorizeMitglieder(req); }

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const fields = parseFieldsParam(searchParams.get("fields"), searchParams.get("preset"));
  const select: Record<string, true> = Object.fromEntries(fields.map(f => [f, true])) as Record<string, true>;

  const gruppeFilter = parseMulti(searchParams.get("gruppe"));
  const statusFilter = parseMulti(searchParams.get("status"));
  const hvm = searchParams.get("hvm");
  const filename = (searchParams.get("filename") || "export").replace(/[^a-zA-Z0-9-_]/g, "_");

  const where: Record<string, unknown> = {};
  if (gruppeFilter) where.gruppe = { in: gruppeFilter.map(g => g.slice(0,1)) };
  if (statusFilter) where.status = { in: statusFilter };
  if (hvm === "yes") where.hausvereinsmitglied = true; else if (hvm === "no") where.hausvereinsmitglied = false;

  try {
    const rows = await prisma.basePerson.findMany({ select, where, orderBy: { id: "asc" } });
    const header = fields.map(f => FIELD_LABELS[f] || f.replace(/_/g, " ")).join(",");
    const lines = rows.map((r: Record<string, unknown>) => fields.map(f => toCsvCell(r[f])).join(","));
    const csv = [header, ...lines].join("\n");
    const body = new TextEncoder().encode("\uFEFF" + csv); // BOM für Excel
    return new NextResponse(body, {
      status: 200,
      headers: new Headers({
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=\"${filename}.csv\"`,
        "cache-control": "no-store",
      }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Export fehlgeschlagen", detail: msg }, { status: 500 });
  }
}

