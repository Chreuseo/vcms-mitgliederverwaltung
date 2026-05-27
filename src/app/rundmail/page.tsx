"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

interface MetaOption {
  bezeichnung: string;
  beschreibung: string | null;
}

interface PreviewRecipient {
  id: number;
  displayName: string;
  email: string;
  gruppe: string;
  status: string;
  hausvereinsmitglied: boolean;
  excluded: boolean;
  exclusionReason: string | null;
}

interface PreviewResponse {
  error?: string;
  statusOptions?: MetaOption[];
  groupOptions?: MetaOption[];
  sendable?: PreviewRecipient[];
  excluded?: PreviewRecipient[];
  summary?: {
    matchingMembers: number;
    sendable: number;
    missingEmail: number;
    excludedByRegex: number;
  };
}

interface SendResponse {
  error?: string;
  ok?: boolean;
  mailId?: number;
  attempted?: number;
  sent?: number;
  failed?: number;
  pdfUrl?: string;
  skipPdfDownload?: boolean;
  failures?: Array<{ recipientId: number; email: string; error: string }>;
}

const DEFAULT_GROUP_FILTER = ["B", "F", "P"];

function buildQuery(params: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  return usp.toString();
}

export default function RundmailPage() {
  const [groupOptions, setGroupOptions] = useState<MetaOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<MetaOption[]>([]);
  const [filterGroups, setFilterGroups] = useState<string[]>(DEFAULT_GROUP_FILTER);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterHvm, setFilterHvm] = useState<"all" | "yes" | "no">("all");
  const [excludeRegex, setExcludeRegex] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [skipPdfDownload, setSkipPdfDownload] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showFilterBox, setShowFilterBox] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendable, setSendable] = useState<PreviewRecipient[]>([]);
  const [excluded, setExcluded] = useState<PreviewRecipient[]>([]);
  const [summary, setSummary] = useState<PreviewResponse["summary"]>();
  const [fileInputKey, setFileInputKey] = useState(0);

  const query = useMemo(() => buildQuery({
    gruppe: filterGroups.length ? filterGroups.join(",") : undefined,
    status: filterStatus.length ? filterStatus.join(",") : undefined,
    hvm: filterHvm !== "all" ? filterHvm : undefined,
    excludeRegex: excludeRegex.trim() || undefined,
  }), [excludeRegex, filterGroups, filterHvm, filterStatus]);

  const toggleArrayValue = (value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((current) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]);
  };

  const resetFilters = () => {
    setFilterGroups(DEFAULT_GROUP_FILTER);
    setFilterStatus([]);
    setFilterHvm("all");
    setExcludeRegex("");
  };

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await fetch(`/api/rundmail/preview${query ? `?${query}` : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({} as PreviewResponse));
      if (!res.ok) {
        throw new Error(json.error || res.statusText);
      }

      setGroupOptions(json.groupOptions || []);
      setStatusOptions(json.statusOptions || []);
      setSendable(json.sendable || []);
      setExcluded(json.excluded || []);
      setSummary(json.summary);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setSendable([]);
      setExcluded([]);
      setSummary(undefined);
    } finally {
      setLoadingPreview(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPreview();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadPreview]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    setSendMessage(null);

    try {
      const formData = new FormData();
      formData.set("gruppe", filterGroups.join(","));
      formData.set("status", filterStatus.join(","));
      if (filterHvm !== "all") formData.set("hvm", filterHvm);
      formData.set("excludeRegex", excludeRegex);
      formData.set("subject", subject);
      formData.set("content", content);
      if (skipPdfDownload) formData.set("skipPdfDownload", "1");
      for (const attachment of attachments) formData.append("attachments", attachment);

      const res = await fetch("/api/rundmail/send", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({} as SendResponse));
      if (!res.ok) {
        throw new Error(json.error || res.statusText);
      }

      const failureSummary = json.failed ? `, Fehler: ${json.failed}` : "";
      setSendMessage(`Versand abgeschlossen. Versucht: ${json.attempted || 0}, versendet: ${json.sent || 0}${failureSummary}`);

      if (!skipPdfDownload && json.pdfUrl) {
        const pdfRes = await fetch(json.pdfUrl, { cache: "no-store" });
        if (pdfRes.ok) {
          const blob = await pdfRes.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `rundmail-${json.mailId || "versand"}.pdf`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
      }

      setSubject("");
      setContent("");
      setAttachments([]);
      setSkipPdfDownload(false);
      setFileInputKey((current) => current + 1);
      await loadPreview();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rundmail</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Wähle Empfänger über dieselben Filter wie in der Mitgliederliste, schließe Adressen optional per RegEx aus und versende die Nachricht mit Anhängen.
        </p>
      </div>

      <div className="border rounded-md">
        <button
          type="button"
          onClick={() => setShowFilterBox((open) => !open)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
        >
          <span>Filter (Gruppe / Status / Hausvereinsmitglied / Ausschluss)</span>
          <span>{showFilterBox ? "−" : "+"}</span>
        </button>

        {showFilterBox && (
          <div className="p-3 space-y-4 text-sm">
            <div>
              <div className="font-semibold mb-1">Gruppe</div>
              <div className="flex flex-wrap gap-3">
                {groupOptions.map((group) => {
                  const value = group.bezeichnung;
                  return (
                    <label key={value} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={filterGroups.includes(value)}
                        onChange={() => toggleArrayValue(value, setFilterGroups)}
                      />
                      <span>{group.beschreibung || value}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="font-semibold mb-1">Status</div>
              <div className="flex flex-wrap gap-3 max-h-40 overflow-auto pr-2">
                {statusOptions.map((status) => {
                  const value = status.bezeichnung;
                  return (
                    <label key={value} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={filterStatus.includes(value)}
                        onChange={() => toggleArrayValue(value, setFilterStatus)}
                      />
                      <span>{value}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="font-semibold mb-1">Hausvereinsmitglied</div>
              <div className="flex gap-4">
                {(["all", "yes", "no"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="hvm"
                      value={value}
                      checked={filterHvm === value}
                      onChange={() => setFilterHvm(value)}
                      className="accent-blue-600"
                    />
                    <span>{value === "all" ? "Alle" : value === "yes" ? "Ja" : "Nein"}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="font-semibold mb-1 block">Ausschluss (RegEx)</span>
              <input
                type="text"
                value={excludeRegex}
                onChange={(event) => setExcludeRegex(event.target.value)}
                placeholder="z. B. dummy|@example\.invalid$ oder /dummy/i"
                className="w-full rounded border border-black/10 dark:border-white/20 px-3 py-2 bg-background text-foreground"
              />
              <span className="mt-1 block text-xs text-foreground/60">
                Passende E-Mail-Adressen werden aus der Vorschau und aus dem Versand ausgeschlossen.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={resetFilters}
                type="button"
                className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
              >
                Zurücksetzen
              </button>
              <button
                onClick={() => void loadPreview()}
                disabled={loadingPreview}
                type="button"
                className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
              >
                Anwenden
              </button>
            </div>
          </div>
        )}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Betreff</span>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              className="w-full rounded border border-black/10 dark:border-white/20 px-3 py-2 bg-background text-foreground"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Inhalt</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
              rows={12}
              className="w-full rounded border border-black/10 dark:border-white/20 px-3 py-2 bg-background text-foreground"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Anhänge</span>
            <input
              key={fileInputKey}
              type="file"
              multiple
              onChange={(event) => setAttachments(Array.from(event.target.files || []))}
              className="block w-full text-sm"
            />
            {!!attachments.length && (
              <ul className="mt-2 space-y-1 text-xs text-foreground/70">
                {attachments.map((attachment) => (
                  <li key={`${attachment.name}-${attachment.size}-${attachment.lastModified}`}>
                    {attachment.name} ({Math.max(1, Math.round(attachment.size / 1024))} KB)
                  </li>
                ))}
              </ul>
            )}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipPdfDownload}
              onChange={(event) => setSkipPdfDownload(event.target.checked)}
              className="accent-blue-600"
            />
            <span>PDF nach dem Versand nicht automatisch herunterladen</span>
          </label>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <button
            type="submit"
            disabled={sending || !sendable.length}
            className="px-3 py-1 rounded border border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
          >
            {sending ? "Versand läuft…" : "Rundmail senden"}
          </button>
          {loadingPreview && <span>Empfänger werden aktualisiert…</span>}
          {error && <span className="text-red-600">{error}</span>}
          {sendMessage && <span className="text-foreground/70">{sendMessage}</span>}
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded border border-black/10 dark:border-white/10 p-3">
          <div className="text-xs text-foreground/60">Treffer</div>
          <div className="text-2xl font-semibold">{summary?.matchingMembers || 0}</div>
        </div>
        <div className="rounded border border-black/10 dark:border-white/10 p-3">
          <div className="text-xs text-foreground/60">Versendbar</div>
          <div className="text-2xl font-semibold">{summary?.sendable || 0}</div>
        </div>
        <div className="rounded border border-black/10 dark:border-white/10 p-3">
          <div className="text-xs text-foreground/60">Ohne E-Mail</div>
          <div className="text-2xl font-semibold">{summary?.missingEmail || 0}</div>
        </div>
        <div className="rounded border border-black/10 dark:border-white/10 p-3">
          <div className="text-xs text-foreground/60">Per RegEx ausgeschlossen</div>
          <div className="text-2xl font-semibold">{summary?.excludedByRegex || 0}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Versendbare Empfänger</h2>
            <span className="text-sm text-foreground/60">{sendable.length}</span>
          </div>
          <div className="overflow-auto max-h-[28rem] border rounded-md">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10">Name</th>
                  <th className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10">E-Mail</th>
                  <th className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10">Gruppe</th>
                  <th className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10">Status</th>
                </tr>
              </thead>
              <tbody>
                {sendable.map((recipient) => (
                  <tr key={recipient.id} className="odd:bg-foreground-light even:bg-background">
                    <td className="px-2 py-1 whitespace-nowrap">{recipient.displayName}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{recipient.email}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{recipient.gruppe}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{recipient.status || "—"}</td>
                  </tr>
                ))}
                {!loadingPreview && !sendable.length && (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-foreground/60">Keine versendbaren Empfänger gefunden</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ausgeschlossen</h2>
            <span className="text-sm text-foreground/60">{excluded.length}</span>
          </div>
          <div className="overflow-auto max-h-[28rem] border rounded-md">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10">Name</th>
                  <th className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10">E-Mail</th>
                  <th className="text-left px-2 py-1 border-b border-black/10 dark:border-white/10">Grund</th>
                </tr>
              </thead>
              <tbody>
                {excluded.map((recipient) => (
                  <tr key={`excluded-${recipient.id}`} className="odd:bg-foreground-light even:bg-background">
                    <td className="px-2 py-1 whitespace-nowrap">{recipient.displayName}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{recipient.email || "—"}</td>
                    <td className="px-2 py-1">{recipient.exclusionReason || "—"}</td>
                  </tr>
                ))}
                {!loadingPreview && !excluded.length && (
                  <tr>
                    <td colSpan={3} className="px-2 py-4 text-center text-foreground/60">Keine ausgeschlossenen Empfänger</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
