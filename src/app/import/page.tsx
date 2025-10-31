"use client";
import React, { useState } from "react";

type ImportMessage = { row: number; level: "info" | "warn" | "error"; message: string };
interface ImportResult {
  ok?: boolean;
  error?: string;
  total?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  messages?: ImportMessage[];
}

export default function ImportPage() {
  const [csv, setCsv] = useState<string>("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const text = csv.trim();
      if (!text) throw new Error("Bitte CSV eingeben oder Datei wählen.");
      const res = await fetch("/api/mitglieder/import", {
        method: "POST",
        headers: { "content-type": "text/csv;charset=utf-8" },
        body: text,
      });
      const json: ImportResult = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setResult(json);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    setCsv(text);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">CSV Import</h1>
      <p className="text-sm text-foreground/70">Kopfzeile muss Spaltennamen enthalten. Datensätze mit vorhandener id oder email werden aktualisiert; sonst werden neue angelegt. Nur übergebene Felder werden geändert.</p>

      <form onSubmit={handleUpload} className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="block">
            <span className="block text-sm mb-1">CSV-Datei</span>
            <input type="file" accept=".csv,text/csv" onChange={e => e.target.files && e.target.files[0] && handleFile(e.target.files[0])} />
          </label>
        </div>
        <div>
          <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={10} className="w-full border rounded p-2 font-mono text-xs" placeholder="CSV hier einfügen oder Datei wählen" />
        </div>
        <div>
          <button type="submit" disabled={busy} className="px-3 py-1.5 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10">
            {busy ? "Import läuft…" : "Import starten"}
          </button>
        </div>
      </form>

      {result && (
        <div className="text-sm border rounded p-3">
          {result.error ? (
            <div className="text-red-600">Fehler: {result.error}</div>
          ) : (
            <div className="space-y-2">
              <div>Gesamt: {result.total}, erstellt: {result.created}, aktualisiert: {result.updated}, Fehler: {result.errors}</div>
              {Array.isArray(result.messages) && result.messages.length > 0 && (
                <ul className="list-disc ml-5 space-y-1">
                  {result.messages.slice(0, 100).map((m, idx) => (
                    <li key={idx} className={m.level === 'error' ? 'text-red-600' : m.level === 'warn' ? 'text-yellow-700' : ''}>
                      Zeile {m.row}: {m.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
