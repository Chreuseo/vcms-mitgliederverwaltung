"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ALL_FIELDS, Field, DATE_FIELDS, BOOLEAN_FIELDS, FIELD_LABELS } from "@/lib/mitglieder/constants";

// Standardauswahl für UI (beibehaltener lokaler Default – unterscheidet sich von DEFAULT_LIST_FIELDS)
const DEFAULT_FIELDS: Field[] = ["name","strasse1","plz1","ort1","email"];

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

export default function MitgliederlistePage() {
  const [selected, setSelected] = useState<Field[]>(DEFAULT_FIELDS);
  const [data, setData] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusOptions, setStatusOptions] = useState<MetaOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<MetaOption[]>([]);
  const [filterGroups, setFilterGroups] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterHvm, setFilterHvm] = useState<'all'|'yes'|'no'>('all');
  const [showColumnsBox, setShowColumnsBox] = useState(false);
  const [showFilterBox, setShowFilterBox] = useState(false);

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
    setFilterGroups([]); setFilterStatus([]); setFilterHvm('all');
  };

  return (
    <div className="bg-background text-foreground">
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mitgliederliste</h1>
        <p className="text-sm text-foreground/70 mt-1">Spalten & Filter anpassen.</p>
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
        {loading && <span>Lädt…</span>}
        {error && <span className="text-red-600">{error}</span>}
        <span className="ml-auto text-foreground/60">{data.length} Einträge</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              {selected.map(f => (
                <th key={f} className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10 whitespace-nowrap">{FIELD_LABELS[f] || f.replace(/_/g," ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.id} className="odd:bg-foreground-light even:bg-background">
                {selected.map(f => {
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
    </div>
  );
}
