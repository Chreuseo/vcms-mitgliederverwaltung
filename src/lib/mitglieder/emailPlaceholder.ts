export function normalizeForEmailLocalPart(input: string): string {
  const s = (input ?? "").trim().toLowerCase();
  if (!s) return "";

  // Deutsche Sonderzeichen stabil in ASCII abbilden
  const umlauted = s
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");

  // Alles was kein a-z / 0-9 ist zu Trennzeichen machen
  const cleaned = umlauted.replace(/[^a-z0-9]+/g, "-");

  // Mehrfachtrennzeichen reduzieren und Ränder trimmen
  return cleaned.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function makePlaceholderEmail(params: {
  vorname?: string | null;
  nachname?: string | null;
  id?: number | string;
  domain?: string | null;
}): string {
  const domain = (params.domain ?? process.env.MAIL_PLACEHOLDER_DOMAIN ?? "").trim();
  if (!domain) throw new Error("MAIL_PLACEHOLDER_DOMAIN ist nicht gesetzt");

  const v = normalizeForEmailLocalPart(params.vorname ?? "");
  const n = normalizeForEmailLocalPart(params.nachname ?? "");

  // Wenn keine Namen vorhanden sind, trotzdem stabil bleiben
  const base = [v, n].filter(Boolean).join(".") || "user";

  // Kollisionsarm und deterministisch: immer ID anhängen, wenn vorhanden
  const idPart = params.id === undefined || params.id === null || String(params.id).trim() === "" ? "" : `.${normalizeForEmailLocalPart(String(params.id)) || String(params.id)}`;

  return `${base}${idPart}@${domain}`;
}
