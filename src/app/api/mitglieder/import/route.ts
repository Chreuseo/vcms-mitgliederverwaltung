import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALL_FIELDS, EDITABLE_FIELDS, DATE_FIELDS, BOOLEAN_FIELDS, INT_FIELDS, FIELD_LABELS } from "@/lib/mitglieder/constants";
import type { Field } from "@/lib/mitglieder/constants";
import { authorizeMitglieder } from "@/lib/mitglieder/auth";

// Hilfen
function normalizeHeader(s: string): string {
  return s
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function slugifyHeader(s: string): string {
  // Entfernt Diakritika (Umlaute etc.) und ersetzt Leerzeichen durch _
  return normalizeHeader(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, "_");
}

const REVERSE_LABELS: Record<string, Field> = (() => {
  const map: Record<string, Field> = {};
  for (const f of ALL_FIELDS as readonly string[]) {
    const label = FIELD_LABELS[f] || f.replace(/_/g, " ");
    map[normalizeHeader(label)] = f as Field;
    map[slugifyHeader(label)] = f as Field;
    map[normalizeHeader(f)] = f as Field;
    map[slugifyHeader(f)] = f as Field;
  }
  map["id"] = "id" as Field;
  return map;
})();

function detectDelimiter(headerLine: string): string {
  // Bevorzugt ;, dann ,, dann Tab
  const candidates = [";", ",", "\t"];
  let best = ";";
  let max = -1;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > max) { max = count; best = c; }
  }
  return best;
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  // Einfache CSV-Parser mit Quote-Unterstützung ("..." und Verdopplung von ")
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(l => l.length > 0);
  if (!lines.length) return { header: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  const rows: string[][] = [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = ""; let inQ = false; let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i+1] === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += ch; i++;
      } else {
        if (ch === '"') { inQ = true; i++; continue; }
        if (line.startsWith(delim, i)) { out.push(cur); cur = ""; i += delim.length; continue; }
        cur += ch; i++;
      }
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]);
  // BOM entfernen, falls vorhanden
  if (header.length > 0) header[0] = header[0].replace(/^\uFEFF/, "");
  for (let li = 1; li < lines.length; li++) {
    const row = parseLine(lines[li]);
    // Padding auf Header-Länge
    while (row.length < header.length) row.push("");
    rows.push(row);
  }
  return { header, rows };
}

function parseBool(v: unknown): boolean | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "" ) return null;
  if (["1","true","ja","yes","y","x"].includes(s)) return true;
  if (["0","false","nein","no","n"].includes(s)) return false;
  return null;
}

function parseIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function parseDateFlexible(v: unknown): Date | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // dd.mm.yyyy oder d.m.yyyy
  const m = s.match(/^([0-3]?\d)[.\/\\-]([0-1]?\d)[.\/\\-](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10); const month = parseInt(m[2], 10) - 1; let year = parseInt(m[3], 10);
    if (year < 100) year += 2000; // pragmatisch
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }
  // Versuch als Date
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function coerceFieldValue(key: Field, raw: unknown): unknown {
  if (raw == null) return null;
  if (DATE_FIELDS.has(key)) return parseDateFlexible(raw);
  if (BOOLEAN_FIELDS.has(key)) {
    const b = parseBool(raw);
    return b === null ? null : b;
  }
  if (INT_FIELDS.has(key)) return parseIntOrNull(raw);
  if (key === "gruppe") {
    const s = String(raw).trim();
    if (!s) return undefined; // undefined: Feld nicht überschreiben beim Update
    return s.length === 1 ? s : s.slice(0,1);
  }
  if (key === "status") {
    const s = String(raw).trim();
    return s === "" ? null : s;
  }
  return String(raw).trim() === "" ? null : String(raw);
}

async function authorize(req: NextRequest) { return authorizeMitglieder(req); }

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let csvText = "";
  const ctype = req.headers.get("content-type") || "";
  try {
    if (ctype.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = (form.get("file") || form.get("csv")) as File | null;
      if (!file) return NextResponse.json({ error: "Kein Datei-Upload gefunden (Feld 'file' oder 'csv')" }, { status: 400 });
      csvText = await file.text();
    } else if (ctype.includes("text/csv") || ctype.includes("text/plain") || ctype.includes("application/octet-stream")) {
      csvText = await req.text();
    } else {
      // Optional JSON mit { csv: "..." }
      try {
        const j = await req.json();
        if (!j || typeof j.csv !== "string") return NextResponse.json({ error: "CSV-Text im Feld 'csv' erwartet" }, { status: 400 });
        csvText = j.csv;
      } catch {
        return NextResponse.json({ error: "Ungültiger Inhalt. Erwartet multipart/form-data (file/csv), text/csv oder JSON mit Feld 'csv'." }, { status: 415 });
      }
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: "Upload konnte nicht gelesen werden", detail: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  if (!csvText.trim()) return NextResponse.json({ error: "CSV ist leer" }, { status: 400 });

  const { header, rows } = parseCsv(csvText);
  if (!header.length) return NextResponse.json({ error: "CSV ohne Kopfzeile" }, { status: 400 });

  // Header-Mapping
  const mapped: (Field | null)[] = header.map(h => REVERSE_LABELS[normalizeHeader(h)] || REVERSE_LABELS[slugifyHeader(h)] || null);
  const unknownHeaders = header.filter((_, i) => mapped[i] === null);
  const usedFields = new Set<Field>(mapped.filter(Boolean) as Field[]);
  if (!usedFields.size) return NextResponse.json({ error: "Keine bekannten Spalten im CSV" }, { status: 400 });

  // Felder auf EDITABLE beschränken (id kann als Ident benutzt werden, wird aber nicht überschrieben)
  const updatable = new Set<Field>(EDITABLE_FIELDS as Field[]);

  // Verarbeiten
  const summary = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: 0 };
  const messages: Array<{ row: number; level: "info"|"warn"|"error"; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      // Datensatz bauen
      const dataRaw: Record<string, unknown> = {};
      for (let c = 0; c < row.length && c < mapped.length; c++) {
        const field = mapped[c];
        if (!field) continue; // Unbekannt -> ignorieren
        if (field === "id" as Field) continue; // id nie aktualisieren
        if (!updatable.has(field)) continue;
        const val = coerceFieldValue(field, row[c]);
        // Gruppe: undefined bedeutet nicht setzen (für Updates)
        if (field === "gruppe" && typeof val === "undefined") continue;
        dataRaw[field] = val;
      }

      // Identifizieren
      const idIdx = mapped.findIndex(m => m === ("id" as Field));
      const emailIdx = mapped.findIndex(m => m === ("email" as Field));
      const idVal = idIdx >= 0 ? parseIntOrNull(row[idIdx]) : null;
      const emailVal = emailIdx >= 0 ? String(row[emailIdx] ?? "").trim() : "";

      let existing: { id: number } | null = null;
      if (idVal && idVal > 0) {
        existing = await prisma.basePerson.findUnique({ where: { id: idVal }, select: { id: true } });
      }
      if (!existing && emailVal) {
        existing = await prisma.basePerson.findUnique({ where: { email: emailVal }, select: { id: true } });
      }

      if (existing) {
        // Update nur der gelieferten Felder
        await prisma.basePerson.update({ where: { id: existing.id }, data: dataRaw });
        summary.updated++;
      } else {
        // Create – nur die gelieferten Felder
        // Email aus CSV mitnehmen wenn vorhanden
        if (emailVal && !("email" in dataRaw)) dataRaw.email = emailVal;
        // Standard für Hausverein, wenn nicht angegeben
        if (typeof (dataRaw as { [k: string]: unknown }).hausvereinsmitglied === "undefined") {
          (dataRaw as { [k: string]: unknown }).hausvereinsmitglied = false;
        }
        try {
          await prisma.basePerson.create({ data: dataRaw });
          summary.created++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.toLowerCase().includes("unique") && emailVal) {
            // race: email inzwischen vorhanden -> update
            const found = await prisma.basePerson.findUnique({ where: { email: emailVal }, select: { id: true } });
            if (found) {
              await prisma.basePerson.update({ where: { id: found.id }, data: dataRaw });
              summary.updated++;
            } else {
              summary.errors++;
              messages.push({ row: i+2, level: "error", message: `Unique-Fehler bei Email ${emailVal}: ${msg}` });
            }
          } else {
            summary.errors++;
            messages.push({ row: i+2, level: "error", message: `Fehler beim Anlegen: ${msg}` });
          }
        }
      }
    } catch (e: unknown) {
      summary.errors++;
      messages.push({ row: i+2, level: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (unknownHeaders.length) {
    messages.unshift({ row: 1, level: "warn", message: `Ignorierte Spalten: ${unknownHeaders.join(", ")}` });
  }

  return NextResponse.json({ ok: true, ...summary, messages });
}
