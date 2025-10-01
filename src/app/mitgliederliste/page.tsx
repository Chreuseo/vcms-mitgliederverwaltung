"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

// Spaltenliste synchron zu API ALL_FIELDS (Subset für UI optional erweiterbar)
const ALL_FIELDS = [
  "id","anrede","titel","rang","vorname","praefix","name","suffix","geburtsname","zusatz1","strasse1","ort1","plz1","land1","telefon1","datum_adresse1_stand","zusatz2","strasse2","ort2","plz2","land2","telefon2","datum_adresse2_stand","region1","region2","mobiltelefon","email","skype","webseite","datum_geburtstag","beruf","heirat_partner","heirat_datum","tod_datum","tod_ort","gruppe","datum_gruppe_stand","status","semester_reception","semester_promotion","semester_philistrierung","semester_aufnahme","semester_fusion","austritt_datum","spitzname","anschreiben_zusenden","spendenquittung_zusenden","vita","bemerkung","password_hash","validationkey","keycloak_id","hausvereinsmitglied"
] as const;

type Field = typeof ALL_FIELDS[number];

const DEFAULT_FIELDS: Field[] = [...ALL_FIELDS];

interface PersonRow {
  id: number;
  [k: string]: unknown;
}

// Definiere einen Typ für die JSON-Antwort
interface ApiResponse {
  error?: string;
  data?: PersonRow[];
}

const DATE_FIELDS = new Set([
  "datum_adresse1_stand","datum_adresse2_stand","datum_geburtstag","heirat_datum","tod_datum","datum_gruppe_stand","austritt_datum"
]);
const BOOL_FIELDS = new Set(["anschreiben_zusenden","spendenquittung_zusenden","hausvereinsmitglied"]);

const LABELS: Record<string,string> = {
  name: "Name (Nachname)",
  vorname: "Vorname",
  datum_geburtstag: "Geburtstag",
  datum_adresse1_stand: "Adr1 Stand",
  datum_adresse2_stand: "Adr2 Stand",
  datum_gruppe_stand: "Gruppe Stand",
  anschreiben_zusenden: "Anschreiben",
  spendenquittung_zusenden: "Spendenquittung",
  hausvereinsmitglied: "Hausverein",
};

export default function MitgliederlistePage() {
  const [selected, setSelected] = useState<Field[]>(DEFAULT_FIELDS);
  const [data, setData] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryFields = useMemo(() => {
    // id wird von API implizit ergänz; wir schicken aber sicherheitshalber
    const f = ["id", ...selected];
    return Array.from(new Set(f)).join(",");
  }, [selected]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/mitglieder?fields=${encodeURIComponent(queryFields)}`, { cache: "no-store" });
      if (!res.ok) {
        const j: ApiResponse = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      const json: ApiResponse = await res.json();
      setData(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [queryFields]);

  useEffect(() => { load(); }, [load]);

  const toggle = (f: Field) => {
    setSelected(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mitgliederliste</h1>
        <p className="text-sm text-foreground/70 mt-1">Spalten auswählen und Mitglieder bearbeiten.</p>
      </div>

      <fieldset className="border rounded-md p-3 flex flex-wrap gap-4">
        {ALL_FIELDS.map(f => (
          <label key={f} className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={selected.includes(f)} onChange={()=>toggle(f)} className="accent-blue-600" /> {LABELS[f] || f}
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-4 text-sm">
        <button onClick={load} disabled={loading} className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50">Neu laden</button>
        {loading && <span>Lädt…</span>}
        {error && <span className="text-red-600">{error}</span>}
        <span className="ml-auto text-foreground/60">{data.length} Einträge</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              {selected.map(f => (
                <th key={f} className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10 whitespace-nowrap">{LABELS[f] || f.replace(/_/g," ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.id} className="odd:bg-black/5 dark:odd:bg-white/5">
                {selected.map(f => {
                  // Passe die Tabellendarstellung an, um Vorname und Name zusammen zu rendern
                  if (f === "name") {
                    const display = `${row.vorname || ""} ${row.name || ""}`.trim() || `#${row.id}`;
                    return (
                      <td key={f} className="px-2 py-1 whitespace-nowrap">
                        <Link href={`/mitgliederliste/${row.id}`} className="text-blue-600 hover:underline">{display}</Link>
                      </td>
                    );
                  }
                  let val = row[f];
                  if (val == null) return <td key={f} className="px-2 py-1 whitespace-nowrap"></td>;
                  if (DATE_FIELDS.has(f) && val) {
                    try { val = new Date(String(val)).toLocaleDateString("de-DE"); } catch {}
                  }
                  if (BOOL_FIELDS.has(f)) {
                    val = val ? "✓" : "";
                  }
                  if (typeof val === "string" && val.length > 60) {
                    val = val.slice(0,57)+"…";
                  }
                  return <td key={f} className="px-2 py-1 whitespace-nowrap">{String(val)}</td>;
                })}
              </tr>
            ))}
            {!loading && !data.length && !error && (
              <tr><td colSpan={selected.length} className="px-2 py-4 text-center text-foreground/60">Keine Daten gefunden</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
