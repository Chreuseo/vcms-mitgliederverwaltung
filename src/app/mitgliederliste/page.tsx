"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ALL_FIELDS, Field, DATE_FIELDS, BOOLEAN_FIELDS, FIELD_LABELS } from "@/lib/mitglieder/constants";

// Standardauswahl für UI (beibehaltener lokaler Default – unterscheidet sich von DEFAULT_LIST_FIELDS)
const DEFAULT_FIELDS: Field[] = ["name","strasse1","plz1","ort1","email", "datum_geburtstag"];

// NEU: Default-Gruppenfilter – verwende die einstelligen Codes aus BaseGruppe.bezeichnung
const DEFAULT_GROUP_FILTER = ["B", "F", "P"];

interface PersonRow {
  id: number;
  [k: string]: unknown;
}

// Definiere einen Typ für die JSON-Antwort
interface ApiResponse {
  error?: string;
  data?: PersonRow[];
  statusOptions?: MetaOption[];
  groupOptions?: MetaOption[];
}

interface MetaOption { bezeichnung: string; beschreibung: string | null }

// Sortiermodi
type SortMode = 'normal' | 'date-full' | 'date-day';
interface SortConfig { field: Field | null; direction: 'asc'|'desc'; mode: SortMode; }

export default function MitgliederlistePage() {
  const [selected, setSelected] = useState<Field[]>(DEFAULT_FIELDS);
  const [data, setData] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusOptions, setStatusOptions] = useState<MetaOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<MetaOption[]>([]);
  // Default: vorgegebene Gruppen gefiltert
  const [filterGroups, setFilterGroups] = useState<string[]>(DEFAULT_GROUP_FILTER);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterHvm, setFilterHvm] = useState<'all'|'yes'|'no'>('all');
  const [showColumnsBox, setShowColumnsBox] = useState(false);
  const [showFilterBox, setShowFilterBox] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  // NEU: Sortierkonfiguration
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: null, direction: 'asc', mode: 'normal' });

  const queryFields = useMemo(() => {
    const f = ["id", ...selected];
    return Array.from(new Set(f)).join(",");
  }, [selected]);

  const queryFilter = useMemo(() => {
    const params: string[] = [];
    if (filterGroups.length) params.push(`gruppe=${encodeURIComponent(filterGroups.join(','))}`);
    if (filterStatus.length) params.push(`status=${encodeURIComponent(filterStatus.join(','))}`);
    if (filterHvm !== 'all') params.push(`hvm=${filterHvm}`);
    return params.join('&');
  }, [filterGroups, filterStatus, filterHvm]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = `/api/mitglieder?meta=1&fields=${encodeURIComponent(queryFields)}${queryFilter ? `&${queryFilter}` : ''}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const j: ApiResponse = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      const json: ApiResponse = await res.json();
      setData(json.data || []);
      if (json.statusOptions) setStatusOptions(json.statusOptions);
      if (json.groupOptions) setGroupOptions(json.groupOptions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [queryFields, queryFilter]);

  useEffect(() => { load(); }, [load]);

  const toggle = (f: Field) => {
    setSelected(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const toggleArrayValue = (value: string, listSetter: React.Dispatch<React.SetStateAction<string[]>>) => {
    listSetter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const resetFilters = () => {
    // Zurücksetzen auf die Default-Gruppen, keine Status, HVM = all
    setFilterGroups(DEFAULT_GROUP_FILTER);
    setFilterStatus([]);
    setFilterHvm('all');
  };

  const runSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetch('/api/mitglieder/sync-emails', { method: 'POST' });
      const json = await res.json().catch(()=>({ error: 'Unbekannte Antwort'}));
      if (!res.ok) { setSyncMsg(json.error || res.statusText); return; }
      const attrPart = typeof json.attributesUpdated === 'number' ? `, Attribute: ${json.attributesUpdated}` : '';
      setSyncMsg(`Aktualisiert: ${json.updated} / ${json.attempted}${attrPart}`);
      await load();
    } catch (e) { setSyncMsg(e instanceof Error ? e.message : String(e)); }
    finally { setSyncing(false); }
  };

  // Hilfsfunktionen für Sortierung
  const isSemesterField = (f: Field) => f.startsWith('semester_');

  const parseDate = (val: unknown): Date | null => {
    if (!val) return null;
    const d = new Date(String(val));
    return isNaN(d.getTime()) ? null : d;
  };

  const dayOfYear = (d: Date) => {
    const start = new Date(d.getFullYear(),0,0);
    const diff = (d.getTime() - start.getTime());
    return Math.floor(diff / 86400000); // 86400000 ms pro Tag
  };

  const parseSemesterYear = (val: unknown): number | null => {
    if (!val) return null;
    const m = String(val).match(/(\d{4})/);
    if (!m) return null;
    return parseInt(m[1],10);
  };

  const comparator = (a: PersonRow, b: PersonRow): number => {
    const field = sortConfig.field;
    if (!field) return 0;
    const va = a[field];
    const vb = b[field];
    // Null / undefined Handling
    const aNull = va == null || va === '';
    const bNull = vb == null || vb === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1; // Nulls ans Ende bei ASC (werden später mit direction multipliziert)
    if (bNull) return -1;

    // Datumsfelder
    if (DATE_FIELDS.has(field) || field === 'datum_geburtstag') {
      const da = parseDate(va);
      const db = parseDate(vb);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      if (sortConfig.mode === 'date-day') {
        const doa = dayOfYear(da);
        const dob = dayOfYear(db);
        return doa - dob;
      } else { // 'date-full'
        return da.getTime() - db.getTime();
      }
    }

    // Semesterfelder -> Sortierung nach Jahreszahl
    if (isSemesterField(field)) {
      const ya = parseSemesterYear(va);
      const yb = parseSemesterYear(vb);
      if (ya == null && yb == null) return 0;
      if (ya == null) return 1;
      if (yb == null) return -1;
      return ya - yb; // gleiche Jahre bleiben stabil
    }

    // Boolean Felder
    if (BOOLEAN_FIELDS.has(field)) {
      const ba = va ? 1 : 0;
      const bb = vb ? 1 : 0;
      return ba - bb;
    }

    // Numerische Felder
    if (typeof va === 'number' && typeof vb === 'number') {
      return va - vb;
    }

    // Versuche Zahl aus String
    const numA = Number(va);
    const numB = Number(vb);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }

    // String Vergleich (case-insensitive, locale de)
    return String(va).localeCompare(String(vb), 'de', { sensitivity: 'base' });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig.field) return data;
    const factor = sortConfig.direction === 'asc' ? 1 : -1;
    return [...data].sort((a,b) => comparator(a,b) * factor);
  }, [data, sortConfig]);

  // Zyklus der Sortierung beim Klick auf Header
  const cycleSort = (field: Field) => {
    setSortConfig(cur => {
      // Wenn anderes Feld -> neu starten
      if (cur.field !== field) {
        if (DATE_FIELDS.has(field) || field === 'datum_geburtstag') {
          return { field, direction: 'asc', mode: 'date-full' };
        }
        return { field, direction: 'asc', mode: 'normal' };
      }
      // Gleiches Feld
      if (DATE_FIELDS.has(field) || field === 'datum_geburtstag') {
        // Reihenfolge: date-full asc -> date-full desc -> date-day asc -> date-day desc -> unsort
        if (cur.mode === 'date-full' && cur.direction === 'asc') return { field, direction: 'desc', mode: 'date-full' };
        if (cur.mode === 'date-full' && cur.direction === 'desc') return { field, direction: 'asc', mode: 'date-day' };
        if (cur.mode === 'date-day' && cur.direction === 'asc') return { field, direction: 'desc', mode: 'date-day' };
        // zurück zu unsortiert
        return { field: null, direction: 'asc', mode: 'normal' };
      } else {
        // Nicht-Datum: normal asc -> normal desc -> unsort
        if (cur.direction === 'asc') return { field, direction: 'desc', mode: 'normal' };
        return { field: null, direction: 'asc', mode: 'normal' };
      }
    });
  };

  const renderSortIndicator = (field: Field) => {
    if (sortConfig.field !== field) return null;
    const dirSymbol = sortConfig.direction === 'asc' ? '↑' : '↓';
    if (DATE_FIELDS.has(field) || field === 'datum_geburtstag') {
      if (sortConfig.mode === 'date-day') {
        return <span className="ml-1 text-xs" title="Sortierung nach Tag im Jahr">{dirSymbol}T</span>;
      }
      return <span className="ml-1 text-xs" title="Sortierung nach vollständigem Datum">{dirSymbol}J</span>; // J = Jahr
    }
    return <span className="ml-1 text-xs" title="Sortierung">{dirSymbol}</span>;
  };

  const renderCell = (row: PersonRow, f: Field) => {
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
    if (BOOLEAN_FIELDS.has(f)) {
      val = val ? "✓" : "";
    }
    if (typeof val === "string" && val.length > 60) {
      val = val.slice(0,57)+"…";
    }
    return <td key={f} className="px-2 py-1 whitespace-nowrap">{String(val)}</td>;
  };

  return (
    <div className="bg-background text-foreground">
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mitgliederliste</h1>
        <p className="text-sm text-foreground/70 mt-1">Spalten & Filter anpassen. Klick auf Spaltenkopf sortiert (Datum: Jahr / Tag).</p>
      </div>

      <div className="space-y-3">
        <div className="border rounded-md">
          <button type="button" onClick={() => setShowColumnsBox(s => !s)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium">
            <span>Spaltenauswahl</span>
            <span>{showColumnsBox ? '−' : '+'}</span>
          </button>
          {showColumnsBox && (
            <fieldset className="p-3 flex flex-wrap gap-4 text-sm max-h-72 overflow-auto">
              {ALL_FIELDS.map(f => (
                <label key={f} className="flex items-center gap-1">
                  <input type="checkbox" checked={selected.includes(f)} onChange={()=>toggle(f)} className="accent-blue-600" /> {(FIELD_LABELS[f] || f.replace(/_/g,' '))}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <div className="border rounded-md">
          <button type="button" onClick={() => setShowFilterBox(s => !s)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium">
            <span>Filter (Gruppe / Status / Hausvereinsmitglied)</span>
            <span>{showFilterBox ? '−' : '+'}</span>
          </button>
          {showFilterBox && (
            <div className="p-3 space-y-4 text-sm">
              <div>
                <div className="font-semibold mb-1">Gruppe</div>
                <div className="flex flex-wrap gap-3">
                  {groupOptions.map(g => {
                    const val = g.bezeichnung;
                    return (
                      <label key={val} className="flex items-center gap-1">
                        <input type="checkbox" className="accent-blue-600" checked={filterGroups.includes(val)} onChange={()=>toggleArrayValue(val,setFilterGroups)} />
                        <span>{g.beschreibung || val}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="font-semibold mb-1">Status</div>
                <div className="flex flex-wrap gap-3 max-h-40 overflow-auto pr-2">
                  {statusOptions.map(s => {
                    const val = s.bezeichnung;
                    return (
                      <label key={val} className="flex items-center gap-1">
                        <input type="checkbox" className="accent-blue-600" checked={filterStatus.includes(val)} onChange={()=>toggleArrayValue(val,setFilterStatus)} />
                        <span>{val}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="font-semibold mb-1">Hausvereinsmitglied</div>
                <div className="flex gap-4">
                  {(['all','yes','no'] as const).map(v => (
                    <label key={v} className="flex items-center gap-1">
                      <input type="radio" name="hvm" value={v} checked={filterHvm===v} onChange={()=>setFilterHvm(v)} className="accent-blue-600" />
                      <span>{v==='all'?'Alle': v==='yes'?'Ja':'Nein'}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={resetFilters} type="button" className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10">Zurücksetzen</button>
                <button onClick={load} disabled={loading} type="button" className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50">Anwenden</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <button onClick={load} disabled={loading} className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50">Neu laden</button>
        <Link href="/mitgliederliste/neu" className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10">Neuer Eintrag</Link>
        <button onClick={runSync} disabled={syncing} className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50">{syncing? 'Sync…':'Sync mit Keycloak (Mails & Attribute)'}</button>
        {loading && <span>Lädt…</span>}
        {error && <span className="text-red-600">{error}</span>}
        {syncMsg && <span className="text-foreground/60">{syncMsg}</span>}
        <span className="ml-auto text-foreground/60">{sortedData.length} Einträge</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              {selected.map(f => (
                <th key={f} className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10 whitespace-nowrap">
                  <button type="button" onClick={()=>cycleSort(f)} className="flex items-center group">
                    <span className="group-hover:underline">{FIELD_LABELS[f] || f.replace(/_/g," ")}</span>
                    {renderSortIndicator(f)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map(row => (
              <tr key={row.id} className="odd:bg-foreground-light even:bg-background">
                {selected.map(f => renderCell(row,f))}
              </tr>
            ))}
            {!loading && !sortedData.length && !error && (
              <tr><td colSpan={selected.length} className="px-2 py-4 text-center text-foreground/60">Keine Daten gefunden</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
    </div>
  );
}
