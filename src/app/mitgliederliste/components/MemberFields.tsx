"use client";
import React, { useEffect, useState } from "react";
import { DATE_FIELDS, BOOLEAN_FIELDS } from "@/lib/mitglieder/constants";

export interface Option { bezeichnung: string; beschreibung: string | null }

export interface MemberFieldsEditorProps {
  visibleFields: string[];
  editableFields: string[];
  person: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  statusOptions: Option[];
  groupOptions: Option[];
  className?: string;
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

const SEMESTER_FIELDS = [
  "semester_reception",
  "semester_promotion",
  "semester_philistrierung",
  "semester_aufnahme",
  "semester_fusion"
];

interface SemesterDraft { type: string; year: string }

export const MemberFieldsEditor: React.FC<MemberFieldsEditorProps> = ({ visibleFields, editableFields, person, onChange, statusOptions, groupOptions, className }) => {
  // Semester Draft Handling
  const [semesterDraft, setSemesterDraft] = useState<Record<string, SemesterDraft>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    const map: Record<string, SemesterDraft> = {};
    SEMESTER_FIELDS.forEach(f => {
      const raw = String(person[f] ?? "");
      let type = ""; let year = "";
      const full = raw.match(/^(WS|SS)(\d{4})(\d{4})?$/);
      if (full) { type = full[1]; year = full[2]; }
      else {
        const onlyType = raw.match(/^(WS|SS)$/); if (onlyType) type = onlyType[1];
        const onlyYear = raw.match(/^(\d{4})$/); if (onlyYear) year = onlyYear[1];
      }
      map[f] = { type, year };
    });
    setSemesterDraft(map);
    setInitialized(true);
  }, [person, initialized]);

  return (
    <div className={"grid gap-4 p-3 sm:grid-cols-2 lg:grid-cols-3 " + (className||"") }>
      {editableFields.filter(f => visibleFields.includes(f)).map(f => {
        const val = person[f];
        if (f === "gruppe") {
          return (
            <label key={f} className="flex flex-col text-sm gap-1">
              <span className="font-medium">Gruppe</span>
              <select
                value={String(val ?? '')}
                onChange={e => onChange(f, e.target.value)}
                className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground"
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
                className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground"
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
                className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground resize-vertical"
              />
            </label>
          );
        }
        if (SEMESTER_FIELDS.includes(f)) {
          const draft = semesterDraft[f] || { type: "", year: "" };
          const { type: semType, year } = draft;
          const buildEncoded = (t: string, y: string): string => {
            if (!t && !y) return "";
            if (t === "WS") {
              if (y.length === 4) return `WS${y}${Number(y) + 1}`;
              return `WS${y}`;
            }
            if (t === "SS") {
              if (y.length === 4) return `SS${y}`;
              return `SS${y}`;
            }
            return y;
          };
          const commitIfComplete = (t: string, y: string) => {
            if ((!t && !y) || (t === "WS" && y.length === 4) || (t === "SS" && y.length === 4)) {
              const encoded = buildEncoded(t, y);
              onChange(f, encoded || null);
            }
          };
          return (
            <label key={f} className="flex flex-col text-sm gap-1">
              <span className="font-medium capitalize">{f.replace(/_/g, " ")}</span>
              <div className="flex gap-2 items-center">
                <select
                  value={semType}
                  onChange={e => {
                    const newType = e.target.value;
                    setSemesterDraft(prev => ({ ...prev, [f]: { type: newType, year } }));
                    commitIfComplete(newType, year);
                  }}
                  className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground"
                >
                  <option value="">-</option>
                  <option value="WS">WS</option>
                  <option value="SS">SS</option>
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={year}
                  onChange={e => {
                    const rawYear = e.target.value.replace(/[^0-9]/g, "").slice(0,4);
                    setSemesterDraft(prev => ({ ...prev, [f]: { type: semType, year: rawYear } }));
                    commitIfComplete(semType, rawYear);
                  }}
                  placeholder="Jahr"
                  className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground w-24"
                />
              </div>
              <div className="text-xs text-foreground/50">
                {semType === "WS" && year.length === 4 ? `${semType}${year}${Number(year)+1}` : semType === "SS" && year.length === 4 ? `${semType}${year}` : "WS + Jahr (ergänzt Folgejahr) oder SS + Jahr; Speicherung erst bei vollständiger Eingabe"}
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
              className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-background text-foreground"
            />
          </label>
        );
      })}
    </div>
  );
};

export default MemberFieldsEditor;
