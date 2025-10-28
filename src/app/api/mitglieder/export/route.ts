import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALL_FIELDS, DEFAULT_LIST_FIELDS, FIELD_LABELS } from "@/lib/mitglieder/constants";
import type { Field } from "@/lib/mitglieder/constants";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";

function parseBool(param: string | null, def = false): boolean {
  if (param == null) return def;
  return param === "1" || param.toLowerCase() === "true";
}

function parseCsvSettings(sp: URLSearchParams) {
  const includeId = parseBool(sp.get("includeId"), false); // Default: nein
  const delimRaw = sp.get("delim") || ";"; // Default: Semikolon
  const delimiter = delimRaw === "tab" ? "\t" : delimRaw;
  const quote = (sp.get("quote") ?? '"'); // Default: doppeltes Anführungszeichen
  const markLinebreaks = parseBool(sp.get("lbmark"), false); // Default: aus
  return { includeId, delimiter, quote, markLinebreaks };
}

function parseFieldsParam(param: string | null, preset: string | null, includeId: boolean): Field[] {
  let fields: Field[] | null = null;
  if (param) {
    const requested = param.split(",").map(p => p.trim()).filter(Boolean);
    const valid: Field[] = [];
    for (const f of requested) {
      if ((ALL_FIELDS as readonly string[]).includes(f)) valid.push(f as Field);
    }
    fields = valid.length ? valid : (DEFAULT_LIST_FIELDS as Field[]);
  } else {
    const PRESETS: Record<string, Field[]> = {
      adressliste: ["vorname","name","strasse1","plz1","ort1","land1","telefon1","mobiltelefon","email"] as Field[],
      geburtstage: ["vorname","name","datum_geburtstag","strasse1","plz1","ort1","land1","email","telefon1","mobiltelefon"] as Field[],
      mailliste: ["vorname","name","email"] as Field[],
    };
    if (preset && PRESETS[preset]) fields = PRESETS[preset];
    else fields = DEFAULT_LIST_FIELDS as Field[];
  }
  // ID je nach Einstellung add/remove
  const hasId = fields.includes("id" as Field);
  if (includeId && !hasId) fields = ["id" as Field, ...fields];
  if (!includeId && hasId) fields = fields.filter(f => f !== ("id" as Field));
  return fields;
}

function toCsvCell(value: unknown, quote: string, delimiter: string, markLinebreaks: boolean): string {
  let v: string;
  if (value == null) v = "";
  else if (value instanceof Date) v = value.toISOString();
  else if (typeof value === "boolean") v = value ? "true" : "false";
  else v = String(value);

  if (markLinebreaks) v = v.replace(/\r?\n/g, "\\n");

  const needsQuote = v.includes("\n") || v.includes("\r") || v.includes(delimiter) || (quote && v.includes(quote));
  if (quote && needsQuote) {
    const escaped = v.replace(new RegExp(quote.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g"), quote + quote);
    return `${quote}${escaped}${quote}`;
  }
  return v;
}

async function authorize(req: NextRequest) { return authorizeMitglieder(req); }

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const { includeId, delimiter, quote, markLinebreaks } = parseCsvSettings(searchParams);
  const fields = parseFieldsParam(searchParams.get("fields"), searchParams.get("preset"), includeId);
  const select: Record<string, true> = Object.fromEntries(fields.map(f => [f, true])) as Record<string, true>;

  const gruppeFilter = (searchParams.get("gruppe") || "").split(",").map(s => s.trim()).filter(Boolean);
  const statusFilter = (searchParams.get("status") || "").split(",").map(s => s.trim()).filter(Boolean);
  const hvm = searchParams.get("hvm");
  const filename = (searchParams.get("filename") || "export").replace(/[^a-zA-Z0-9-_]/g, "_");

  const where: Record<string, unknown> = {};
  if (gruppeFilter.length) where.gruppe = { in: gruppeFilter.map(g => g.slice(0,1)) };
  if (statusFilter.length) where.status = { in: statusFilter };
  if (hvm === "yes") where.hausvereinsmitglied = true; else if (hvm === "no") where.hausvereinsmitglied = false;

  try {
    const rows = await prisma.basePerson.findMany({ select, where, orderBy: { id: "asc" } });
    const header = fields.map(f => {
      const label = FIELD_LABELS[f] || f.replace(/_/g, " ");
      return toCsvCell(label, quote, delimiter, false);
    }).join(delimiter);
    const lines = rows.map((r: Record<string, unknown>) => fields.map(f => toCsvCell(r[f], quote, delimiter, markLinebreaks)).join(delimiter));
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
