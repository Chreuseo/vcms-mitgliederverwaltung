"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_FIELDS, DEFAULT_LIST_FIELDS, FIELD_LABELS } from "@/lib/mitglieder/constants";

// Hilfstypen für Meta
interface Option { bezeichnung: string; beschreibung: string | null }

// Kleine Utilitys
function labelFor(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, " ");
}

function buildQuery(params: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) usp.set(k, v);
  return usp.toString();
}

// Status-Gruppen für Standardfilter
const BUNDESBRUEDER = ["Fuchs", "Bursch", "Philister"] as const;
const BUND_WITWE_VF = ["Fuchs", "Bursch", "Philister", "Witwe", "Vereinsfreund"] as const;

// Presets
const PRESETS: Record<string, { label: string; fields: string[]; description?: string }> = {
  adressliste: {
    label: "Adressliste",
    description: "Name und Postadresse (mit Kontakt)",
    fields: ["vorname","name","strasse1","plz1","ort1","land1","telefon1","mobiltelefon","email"],
  },
  geburtstage: {
    label: "Geburtstagsliste (mit Adressen)",
    fields: ["vorname","name","datum_geburtstag","strasse1","plz1","ort1","land1","email","telefon1","mobiltelefon"],
  },
  mailliste: {
    label: "Mailliste",
    description: "E-Mail-Verteiler mit Namen",
    fields: ["vorname","name","email"],
  },
};

type FilterMode = "alle" | "hvm_yes" | "hvm_no" | "bund" | "bund_wvwf" | "custom";

export default function ExportPage() {
  // Meta
  const [statusOptions, setStatusOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Filterzustand
  const [filterMode, setFilterMode] = useState<FilterMode>("alle");
  const [selGroups, setSelGroups] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [hvm, setHvm] = useState<"any" | "yes" | "no">("any");

  // Benutzerdefinierte Felder
  const [customFields, setCustomFields] = useState<string[]>([...DEFAULT_LIST_FIELDS]);

  // Technische Details (CSV)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [includeId, setIncludeId] = useState(false); // Standard: nein
  const [delimiter, setDelimiter] = useState(";"); // Standard: Semikolon
  const [quote, setQuote] = useState('"'); // Standard: Anführungszeichen
  const [markLinebreaks, setMarkLinebreaks] = useState(false); // Standard: aus

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    setMetaError(null);
    try {
      const res = await fetch("/api/mitglieder?meta=1&fields=id");
      const json = await res.json();
      if (!res.ok) {
        setMetaError(json.error || res.statusText);
        return;
      }
      setStatusOptions(json.statusOptions || []);
      setGroupOptions(json.groupOptions || []);
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : String(e));
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  // Ableiten der Query-Filter
  const { gruppeParam, statusParam, hvmParam } = useMemo(() => {
    if (filterMode === "hvm_yes") return { gruppeParam: undefined, statusParam: undefined, hvmParam: "yes" as const };
    if (filterMode === "hvm_no") return { gruppeParam: undefined, statusParam: undefined, hvmParam: "no" as const };
    if (filterMode === "bund") {
      const statuses = BUNDESBRUEDER as readonly string[];
      return { gruppeParam: undefined, statusParam: statuses.join(","), hvmParam: undefined };
    }
    if (filterMode === "bund_wvwf") {
      const statuses = BUND_WITWE_VF as readonly string[];
      return { gruppeParam: undefined, statusParam: statuses.join(","), hvmParam: undefined };
    }
    if (filterMode === "custom") {
      const g = selGroups.length ? selGroups.join(",") : undefined;
      const s = selStatuses.length ? selStatuses.join(",") : undefined;
      const hv = hvm === "any" ? undefined : hvm;
      return { gruppeParam: g, statusParam: s, hvmParam: hv };
    }
    return { gruppeParam: undefined, statusParam: undefined, hvmParam: undefined };
  }, [filterMode, selGroups, selStatuses, hvm]);

  // Download-Handler
  const downloadCsv = useCallback(async (params: { fields?: string[]; preset?: string; filename?: string }) => {
    // Felder vorbereiten – ID je nach Einstellung ein-/ausschließen
    let effFields = params.fields?.length ? [...params.fields] : undefined;
    if (effFields) {
      if (includeId && !effFields.includes("id")) effFields.unshift("id");
      if (!includeId) effFields = effFields.filter(f => f !== "id");
    }

    // CSV-Optionen
    const delimParam = delimiter === "\t" ? "tab" : delimiter; // Tab speziell kodieren
    const qs = buildQuery({
      fields: effFields?.join(","),
      preset: params.preset,
      gruppe: gruppeParam,
      status: statusParam,
      hvm: hvmParam,
      filename: params.filename,
      includeId: includeId ? "1" : "0",
      delim: delimParam,
      quote: quote || undefined,
      lbmark: markLinebreaks ? "1" : undefined,
    });
    const url = "/api/mitglieder/export" + (qs ? `?${qs}` : "");
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      alert(`Export fehlgeschlagen: ${text}`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (params.filename || params.preset || "export") + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, [gruppeParam, statusParam, hvmParam, includeId, delimiter, quote, markLinebreaks]);

  // UI Komponenten
  const ToggleAllButtons = (
    <div className="flex gap-2 text-xs">
      <button type="button" className="px-2 py-0.5 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setCustomFields([...ALL_FIELDS])}>Alle</button>
      <button type="button" className="px-2 py-0.5 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setCustomFields([])}>Keine</button>
      <button type="button" className="px-2 py-0.5 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setCustomFields([...DEFAULT_LIST_FIELDS])}>Standard</button>
    </div>
  );

  const CustomFilterControls = (
    <div className="grid gap-3 sm:grid-cols-3 text-sm">
      <div>
        <div className="font-medium mb-1">Gruppe</div>
        <div className="max-h-48 overflow-auto border rounded p-2 space-y-1">
          {groupOptions.map(g => (
            <label key={g.bezeichnung} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selGroups.includes(g.bezeichnung)}
                onChange={e => {
                  setSelGroups(prev => e.target.checked ? [...prev, g.bezeichnung] : prev.filter(x => x !== g.bezeichnung));
                }}
              />
              <span>{g.beschreibung || g.bezeichnung}</span>
            </label>
          ))}
          {!groupOptions.length && <div className="text-foreground/50">Keine Gruppen</div>}
        </div>
      </div>
      <div>
        <div className="font-medium mb-1">Status</div>
        <div className="max-h-48 overflow-auto border rounded p-2 space-y-1">
          {statusOptions.map(s => (
            <label key={s.bezeichnung} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selStatuses.includes(s.bezeichnung)}
                onChange={e => {
                  setSelStatuses(prev => e.target.checked ? [...prev, s.bezeichnung] : prev.filter(x => x !== s.bezeichnung));
                }}
              />
              <span>{s.bezeichnung}</span>
            </label>
          ))}
          {!statusOptions.length && <div className="text-foreground/50">Keine Stati</div>}
        </div>
      </div>
      <div>
        <div className="font-medium mb-1">Hausvereinsmitglied</div>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2"><input type="radio" name="hvm" checked={hvm === "any"} onChange={() => setHvm("any")} /> egal</label>
          <label className="flex items-center gap-2"><input type="radio" name="hvm" checked={hvm === "yes"} onChange={() => setHvm("yes")} /> ja</label>
          <label className="flex items-center gap-2"><input type="radio" name="hvm" checked={hvm === "no"} onChange={() => setHvm("no")} /> nein</label>
        </div>
      </div>
    </div>
  );

  const TechnicalDetailsBox = (
    <div className="border rounded-md overflow-hidden">
      <button type="button" onClick={() => setDetailsOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium border-b border-black/10 dark:border-white/10">
        <span>Technische Details</span>
        <span>{detailsOpen ? "−" : "+"}</span>
      </button>
      {detailsOpen && (
        <div className="p-3 space-y-4 text-sm">
          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeId} onChange={e => setIncludeId(e.target.checked)} />
              <span>ID mit exportieren</span>
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block mb-1 font-medium">Trennzeichen</span>
              <input
                type="text"
                value={delimiter}
                onChange={e => setDelimiter(e.target.value || ";")}
                placeholder="; (Semikolon)"
                className="w-full rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground"
              />
              <div className="text-xs text-foreground/60 mt-1">z. B. ; , \t</div>
            </label>
            <label className="block">
              <span className="block mb-1 font-medium">Anführungszeichen</span>
              <input
                type="text"
                value={quote}
                onChange={e => setQuote(e.target.value || '"')}
                placeholder={'"'}
                className="w-full rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground"
              />
              <div className="text-xs text-foreground/60 mt-1">Zeichen zur Textbegrenzung</div>
            </label>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={markLinebreaks} onChange={e => setMarkLinebreaks(e.target.checked)} />
              <span>Zeilenumbruchmarkierung innerhalb von Feldern (\n)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Export</h1>
      <p className="text-sm text-foreground/70">Exportiere Mitgliederdaten als CSV – wähle einen Standard-Export oder stelle Felder und Filter individuell ein.</p>

      <div className="border rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 text-sm font-medium border-b border-black/10 dark:border-white/10">
          <span>Filter</span>
          {metaLoading && <span className="text-xs text-foreground/60">Lädt Meta…</span>}
          {metaError && <span className="text-xs text-red-600">{metaError}</span>}
        </div>
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <label className="flex items-center gap-2">
              <span className="font-medium">Auswahl</span>
              <select
                value={filterMode}
                onChange={e => setFilterMode(e.target.value as FilterMode)}
                className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground"
              >
                <option value="alle">Alle</option>
                <option value="hvm_yes">Nur Hausvereinsmitglieder</option>
                <option value="hvm_no">Ohne Hausverein</option>
                <option value="bund">Nur Bundesbrüder (Fuchs, Bursch, Philister)</option>
                <option value="bund_wvwf">Bundesbrüder + Witwen + Vereinsfreund</option>
                <option value="custom">Benutzerdefiniert…</option>
              </select>
            </label>
          </div>
          {filterMode === "custom" && (
            <div className="pt-2">{CustomFilterControls}</div>
          )}
        </div>
      </div>

      {TechnicalDetailsBox}

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <div key={key} className="border rounded-md overflow-hidden">
            <div className="px-3 py-2 text-sm font-medium border-b border-black/10 dark:border-white/10">{preset.label}</div>
            <div className="p-3 space-y-2 text-sm">
              {preset.description && <p className="text-foreground/70">{preset.description}</p>}
              <div className="text-xs text-foreground/60">Felder: {preset.fields.map(labelFor).join(", ")}</div>
              <div>
                <button
                  className="mt-2 px-3 py-1.5 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => downloadCsv({ preset: key, filename: key })}
                >CSV herunterladen</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border rounded-md overflow-hidden">
        <div className="px-3 py-2 text-sm font-medium border-b border-black/10 dark:border-white/10">Benutzerdefinierter Export</div>
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">Felder auswählen</div>
            {ToggleAllButtons}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {ALL_FIELDS.map(f => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={customFields.includes(f)}
                  onChange={e => setCustomFields(prev => e.target.checked ? [...prev, f] : prev.filter(x => x !== f))}
                />
                <span className="capitalize">{labelFor(f)}</span>
              </label>
            ))}
          </div>
          <div>
            <button
              className="mt-2 px-3 py-1.5 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => downloadCsv({ fields: customFields, filename: "benutzerdefiniert" })}
              disabled={!customFields.length}
            >CSV herunterladen</button>
          </div>
        </div>
      </div>
    </section>
  );
}
