"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DEFAULT_EDIT_FIELDS } from "@/lib/mitglieder/constants";
import MemberFieldsEditor from "../components/MemberFields";

interface Person {
  id: number;
  vorname?: string;
  name?: string;
  email?: string;
  [key: string]: unknown; // Erlaubt zusätzliche Felder mit unbekannten Typen
}
interface LoadResult { data?: Person; editable?: string[]; statusOptions?: { bezeichnung: string; beschreibung: string | null }[]; groupOptions?: { bezeichnung: string; beschreibung: string | null }[]; error?: string; }

export default function MitgliedEditPage() {
  const params = useParams();
  const id = typeof params === "object" && params && "id" in params ? String(params.id) : "";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [editable, setEditable] = useState<string[]>([]);
  const [dirty, setDirty] = useState<Record<string, unknown>>({});
  const [statusOptions, setStatusOptions] = useState<LoadResult["statusOptions"]>([]);
  const [groupOptions, setGroupOptions] = useState<LoadResult["groupOptions"]>([]);
  const [showFieldsBox, setShowFieldsBox] = useState(true);
  const [selectedEditFields, setSelectedEditFields] = useState<string[]>(DEFAULT_EDIT_FIELDS);
  const [showEditFieldsBox, setShowEditFieldsBox] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/mitglieder/${id}`, { cache: "no-store" });
      const json: LoadResult = await res.json().catch(()=>({ error: "Unbekannte Antwort" }));
      if (!res.ok) { setError(json.error || res.statusText); return; }
      setPerson(json.data || null);
      setEditable((json.editable || []).filter(f => f !== "leibmitglied"));
      setStatusOptions(json.statusOptions || []);
      setGroupOptions(json.groupOptions || []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
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
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const toggleEditField = (field: string) => {
    setSelectedEditFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
  };

  if (loading) return <div className="p-4 text-sm">Lädt…</div>;
  if (error) return <div className="p-4 space-y-4"><p className="text-red-600 text-sm">Fehler: {error}</p><button className="px-3 py-1 border rounded text-sm" onClick={load}>Nochmal laden</button></div>;
  if (!person) return <div className="p-4 text-sm">Nicht gefunden</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold">Mitglied bearbeiten</h1>
        {person.id != null && <span className="text-sm text-foreground/60">ID #{person.id}</span>}
        <Link href="/mitgliederliste" className="ml-auto text-blue-600 hover:underline text-sm">Zurück zur Liste</Link>
      </div>

      <div className="space-y-4">
        <div className="border rounded-md">
          <button type="button" onClick={() => setShowEditFieldsBox(s => !s)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium">
            <span>Felderauswahl</span>
            <span>{showEditFieldsBox ? '−' : '+'}</span>
          </button>
          {showEditFieldsBox && (
            <fieldset className="p-3 flex flex-wrap gap-4 text-sm max-h-72 overflow-auto">
              {editable.map(f => (
                <label key={f} className="flex items-center gap-1">
                  <input type="checkbox" checked={selectedEditFields.includes(f)} onChange={() => toggleEditField(f)} className="accent-blue-600" />
                  <span>{f.replace(/_/g,' ')}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <div className="border rounded-md">
          <button type="button" onClick={()=>setShowFieldsBox(s=>!s)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium">
            <span>Felder</span>
            <span>{showFieldsBox ? '−' : '+'}</span>
          </button>
          {showFieldsBox && (
            <MemberFieldsEditor
              visibleFields={selectedEditFields}
              editableFields={editable}
              person={person}
              onChange={onChange}
              statusOptions={statusOptions || []}
              groupOptions={groupOptions || []}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <button disabled={saving || !Object.keys(dirty).length} onClick={save} className="px-4 py-1.5 rounded border border-black/10 dark:border-white/20 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50">Speichern</button>
        {!!Object.keys(dirty).length && <span className="text-xs text-amber-600">{Object.keys(dirty).length} geändert</span>}
        {saving && <span className="text-xs">Speichert…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
