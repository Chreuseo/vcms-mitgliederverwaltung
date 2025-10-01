"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_EDIT_FIELDS } from "@/lib/mitglieder/constants";
import MemberFieldsEditor, { Option } from "../components/MemberFields";

interface CreateResponse { data?: { id?: number }; error?: string; keycloak?: { id: string; created: boolean } }

export default function NeuesMitgliedPage() {
  const [person, setPerson] = useState<Record<string, unknown>>({});
  const [visibleFields] = useState<string[]>(DEFAULT_EDIT_FIELDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [statusOptions, setStatusOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true); setMetaError(null);
    try {
      const res = await fetch('/api/mitglieder?meta=1&fields=id');
      const json = await res.json();
      if (!res.ok) { setMetaError(json.error || res.statusText); return; }
      setStatusOptions(json.statusOptions || []);
      setGroupOptions(json.groupOptions || []);
    } catch (e) { setMetaError(e instanceof Error ? e.message : String(e)); }
    finally { setMetaLoading(false); }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const onChange = (field: string, value: unknown) => {
    setPerson(p => ({ ...p, [field]: value }));
  };

  const submit = useCallback(async () => {
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      const body: Record<string, unknown> = {};
      for (const k of Object.keys(person)) {
        if (person[k] !== undefined) body[k] = person[k];
      }
      const res = await fetch('/api/mitglieder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json: CreateResponse = await res.json().catch(()=>({ error: 'Unbekannte Antwort'}));
      if (!res.ok) { setError(json.error || res.statusText); return; }
      setSuccess(`Angelegt (ID ${json.data?.id}) – Keycloak ${(json.keycloak?.created ? 'neu' : 'bestehend')} (${json.keycloak?.id})`);
      setCreatedId(json.data?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSubmitting(false); }
  }, [person]);

  const canSubmit = typeof person.email === 'string' && person.email.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Neues Mitglied</h1>
        <Link href="/mitgliederliste" className="ml-auto text-blue-600 hover:underline text-sm">Zurück zur Liste</Link>
        {createdId != null && <Link href={`/mitgliederliste/${createdId}`} className="text-blue-600 hover:underline text-sm">Zur Detailansicht</Link>}
      </div>

      <div className="border rounded-md">
        <div className="flex items-center justify-between px-3 py-2 text-sm font-medium border-b border-black/10 dark:border-white/10">
          <span>Felder</span>
          {metaLoading && <span className="text-xs text-foreground/60">Lädt Meta…</span>}
          {metaError && <span className="text-xs text-red-600">{metaError}</span>}
        </div>
        <MemberFieldsEditor
          visibleFields={visibleFields}
          editableFields={visibleFields}
          person={person}
          onChange={onChange}
          statusOptions={statusOptions}
          groupOptions={groupOptions}
        />
      </div>

      <div className="flex items-center gap-4 flex-wrap text-sm">
        <button disabled={!canSubmit || submitting} onClick={submit} className="px-4 py-1.5 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50">Anlegen</button>
        {submitting && <span>Legt an…</span>}
        {error && <span className="text-red-600">{error}</span>}
        {success && <span className="text-green-600">{success}</span>}
        {!person.email && <span className="text-foreground/50">Email erforderlich für Keycloak</span>}
      </div>
    </div>
  );
}
