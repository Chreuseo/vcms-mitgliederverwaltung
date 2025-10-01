"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

// Spaltenliste synchron zu API ALL_FIELDS (Subset für UI optional erweiterbar)
const ALL_FIELDS = [
  "vorname","name","strasse1","plz1","ort1","datum_geburtstag","email","telefon1","mobiltelefon","gruppe","status"
] as const;

type Field = typeof ALL_FIELDS[number];

const DEFAULT_FIELDS: Field[] = [
  "vorname","name","strasse1","plz1","ort1","datum_geburtstag","email"
];

interface PersonRow {
  id: number;
  [k: string]: unknown;
}

const LABELS: Record<string,string> = {
  vorname: "Vorname",
  name: "Name",
  strasse1: "Straße",
  plz1: "PLZ",
  ort1: "Ort",
  datum_geburtstag: "Geburtstag",
  email: "E-Mail",
  telefon1: "Telefon",
  mobiltelefon: "Mobil",
  gruppe: "Gruppe",
  status: "Status",
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
        const j = await res.json().catch(()=>({} as any));
        throw new Error((j as any).error || res.statusText);
      }
      const json = await res.json();
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
                <th key={f} className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10">{LABELS[f] || f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.id} className="odd:bg-black/5 dark:odd:bg-white/5">
                {selected.map(f => {
                  let val = row[f];
                  if (f === "datum_geburtstag" && val) {
                    try { val = new Date(String(val)).toLocaleDateString("de-DE"); } catch {}
                  }
                  if (f === "name") {
                    const display = `${row.vorname || ""} ${row.name || ""}`.trim() || `#${row.id}`;
                    return (
                      <td key={f} className="px-2 py-1 whitespace-nowrap">
                        <Link href={`/mitgliederliste/${row.id}`} className="text-blue-600 hover:underline">{display}</Link>
                      </td>
                    );
                  }
                  return <td key={f} className="px-2 py-1 whitespace-nowrap">{val == null ? "" : String(val)}</td>;
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
