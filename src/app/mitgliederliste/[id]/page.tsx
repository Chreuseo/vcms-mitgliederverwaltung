"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Person {
  id: number;
  [k: string]: unknown;
}

interface LoadResult {
  data?: Person;
  editable?: string[];
  error?: string;
}

const DATE_FIELDS = ["datum_geburtstag"] as const;

function formatDateInput(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || value instanceof Date) {
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().slice(0,10);
    } catch { return ""; }
  }
  return "";
}

export default function MitgliedEditPage() {
  const params = useParams();
  const id = typeof params === "object" && params && "id" in params ? String(params.id) : "";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [editable, setEditable] = useState<string[]>([]);
  const [dirty, setDirty] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/mitglieder/${id}`, { cache: "no-store" });
      const json: LoadResult = await res.json().catch(()=>({ error: "Unbekannte Antwort" }));
      if (!res.ok) { setError(json.error || res.statusText); return; }
      setPerson(json.data || null);
      setEditable(json.editable || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onChange = (field: string, value: unknown) => {
    setDirty(prev => ({ ...prev, [field]: value }));
    setPerson(p => p ? { ...p, [field]: value } : p);
  };

  const save = async () => {
    if (!Object.keys(dirty).length) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/mitglieder/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(dirty) });
      const json = await res.json().catch(()=>({ error: "Unbekannte Antwort" }));
      if (!res.ok) { setError(json.error || res.statusText); return; }
      setDirty({});
      setPerson(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-sm">Lädt…</div>;
  if (error) return <div className="p-4 space-y-4"><p className="text-red-600 text-sm">Fehler: {error}</p><button className="px-3 py-1 border rounded text-sm" onClick={load}>Nochmal laden</button></div>;
  if (!person) return <div className="p-4 text-sm">Nicht gefunden</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Mitglied bearbeiten</h1>
        <span className="text-sm text-foreground/60">ID #{person.id}</span>
        <Link href="/mitgliederliste" className="ml-auto text-blue-600 hover:underline text-sm">Zurück zur Liste</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {editable.map(f => {
          const val = person[f];
          const isDate = (DATE_FIELDS as readonly string[]).includes(f);
          return (
            <label key={f} className="flex flex-col text-sm gap-1">
              <span className="font-medium capitalize">{f.replace(/_/g, " ")}</span>
              <input
                type={isDate ? "date" : "text"}
                value={isDate ? formatDateInput(val) : String(val ?? "")}
                onChange={e => onChange(f, isDate ? e.target.value : e.target.value)}
                className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
              />
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <button disabled={saving || !Object.keys(dirty).length} onClick={save} className="px-4 py-1.5 rounded border border-black/10 dark:border-white/20 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50">Speichern</button>
        {!!Object.keys(dirty).length && <span className="text-xs text-amber-600">{Object.keys(dirty).length} geändert</span>}
        {saving && <span className="text-xs">Speichert…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
