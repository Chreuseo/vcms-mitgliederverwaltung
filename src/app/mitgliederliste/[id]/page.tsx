"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DATE_FIELDS, BOOLEAN_FIELDS, DEFAULT_EDIT_FIELDS } from "@/lib/mitglieder/constants";

interface Person {
  id: number;
  [k: string]: unknown;
}

interface LoadResult {
  data?: Person;
  editable?: string[];
  statusOptions?: { bezeichnung: string; beschreibung: string | null }[];
  groupOptions?: { bezeichnung: string; beschreibung: string | null }[];
  error?: string;
}

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
  const [statusOptions, setStatusOptions] = useState<LoadResult["statusOptions"]>([]);
  const [groupOptions, setGroupOptions] = useState<LoadResult["groupOptions"]>([]);
  const [showFilterBox, setShowFilterBox] = useState(false);
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
                  <input
                    type="checkbox"
                    checked={selectedEditFields.includes(f)}
                    onChange={() => toggleEditField(f)}
                    className="accent-blue-600"
                  />
                  <span>{f.replace(/_/g, ' ')}</span>
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
            <div className="grid gap-4 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {editable.filter(f => selectedEditFields.includes(f)).map(f => {
                const val = person[f];
                if (f === "gruppe") {
                  return (
                    <label key={f} className="flex flex-col text-sm gap-1">
                      <span className="font-medium">Gruppe</span>
                      <select
                        value={String(val ?? '')}
                        onChange={e => onChange(f, e.target.value)}
                        className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                      >
                        <option value="" />
                        {groupOptions?.map(g => (
                          <option key={g.bezeichnung} value={g.bezeichnung}>{g.beschreibung || g.bezeichnung}</option>
                        ))}
                      </select>
                    </label>
                  );
                }
                if (f === "status") {
                  return (
                    <label key={f} className="flex flex-col text-sm gap-1">
                      <span className="font-medium">Status</span>
                      <select
                        value={String(val ?? '')}
                        onChange={e => onChange(f, e.target.value)}
                        className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                      >
                        <option value="" />
                        {statusOptions?.map(s => (
                          <option key={s.bezeichnung} value={s.bezeichnung}>{s.bezeichnung}</option>
                        ))}
                      </select>
                    </label>
                  );
                }
                if (f === "hausvereinsmitglied") {
                  return (
                    <label key={f} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(val)}
                        onChange={e => onChange(f, e.target.checked)}
                        className="accent-blue-600"
                      />
                      <span className="font-medium">Hausvereinsmitglied</span>
                    </label>
                  );
                }
                if (BOOLEAN_FIELDS.has(f)) {
                  const checked = Boolean(val);
                  return (
                    <label key={f} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => onChange(f, e.target.checked)}
                        className="accent-blue-600"
                      />
                      <span className="font-medium capitalize">{f.replace(/_/g, " ")}</span>
                    </label>
                  );
                }
                const isDate = DATE_FIELDS.has(f);
                if (f === "vita") {
                  return (
                    <label key={f} className="flex flex-col text-sm gap-1 sm:col-span-2 lg:col-span-3">
                      <span className="font-medium capitalize">Vita</span>
                      <textarea
                        value={String(val ?? "")}
                        onChange={e => onChange(f, e.target.value)}
                        rows={5}
                        className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent resize-vertical"
                      />
                    </label>
                  );
                }
                if (["semester_reception", "semester_promotion", "semester_philistrierung", "semester_aufnahme"].includes(f)) {
                  const semesterValue = String(val ?? "");
                  const match = semesterValue.match(/^(WS|SS)(\d{4})(\d{4})?$/);
                  const semester = match ? match[1] : "";
                  const year = match ? match[2] : "";
                  const nextYear = match && match[3] ? match[3] : "";

                  return (
                    <label key={f} className="flex flex-col text-sm gap-1">
                      <span className="font-medium capitalize">{f.replace(/_/g, " ")}</span>
                      <div className="flex gap-2 items-center">
                        <select
                          value={semester}
                          onChange={e => {
                            const newSemester = e.target.value;
                            const newValue = newSemester === "WS" && year
                              ? `${newSemester}${year}${Number(year) + 1}`
                              : newSemester === "SS" && year
                              ? `${newSemester}${year}`
                              : "";
                            onChange(f, newValue);
                          }}
                          className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                        >
                          <option value="">-</option>
                          <option value="WS">WS</option>
                          <option value="SS">SS</option>
                        </select>
                        <input
                          type="number"
                          value={year}
                          onChange={e => {
                            const newYear = e.target.value;
                            const newValue = semester === "WS" && newYear
                              ? `${semester}${newYear}${Number(newYear) + 1}`
                              : semester === "SS" && newYear
                              ? `${semester}${newYear}`
                              : "";
                            onChange(f, newValue);
                          }}
                          placeholder="Jahr"
                          className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent w-20"
                        />
                      </div>
                    </label>
                  );
                }
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
