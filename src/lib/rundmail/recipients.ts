import { prisma } from "@/lib/prisma";
import type { MitgliederFilters } from "@/lib/mitglieder/filters";
import { buildMitgliederWhere } from "@/lib/mitglieder/filters";

export interface RundmailRecipientPreview {
  id: number;
  vorname: string;
  name: string;
  displayName: string;
  email: string;
  gruppe: string;
  status: string;
  hausvereinsmitglied: boolean;
  excluded: boolean;
  exclusionReason: string | null;
}

export interface RundmailRecipientsResult {
  regexSource: string | null;
  recipients: RundmailRecipientPreview[];
  sendable: RundmailRecipientPreview[];
  excluded: RundmailRecipientPreview[];
  summary: {
    matchingMembers: number;
    sendable: number;
    missingEmail: number;
    excludedByRegex: number;
  };
}

function normalizeString(value: string | null | undefined): string {
  return (value || "").trim();
}

export function buildDisplayName(person: { vorname?: string | null; name?: string | null; id: number }): string {
  const fullName = `${normalizeString(person.vorname)} ${normalizeString(person.name)}`.trim();
  return fullName || `#${person.id}`;
}

export function compileExcludeRegex(source: string | null | undefined): RegExp | null {
  const trimmed = (source || "").trim();
  if (!trimmed) return null;

  const literalMatch = trimmed.match(/^\/(.*)\/([a-z]*)$/i);
  if (literalMatch) {
    return new RegExp(literalMatch[1], literalMatch[2]);
  }

  return new RegExp(trimmed, "i");
}

export async function findRundmailRecipients(filters: MitgliederFilters, excludeRegexSource?: string | null): Promise<RundmailRecipientsResult> {
  const regex = compileExcludeRegex(excludeRegexSource);
  const rows = await prisma.basePerson.findMany({
    where: buildMitgliederWhere(filters),
    select: {
      id: true,
      vorname: true,
      name: true,
      email: true,
      gruppe: true,
      status: true,
      hausvereinsmitglied: true,
    },
    orderBy: [{ name: "asc" }, { vorname: "asc" }, { id: "asc" }],
  });

  let missingEmail = 0;
  let excludedByRegex = 0;

  const recipients = rows.map((row) => {
    const email = normalizeString(row.email);
    let excluded = false;
    let exclusionReason: string | null = null;

    if (!email) {
      excluded = true;
      exclusionReason = "Keine E-Mail-Adresse";
      missingEmail += 1;
    } else if (regex?.test(email)) {
      excluded = true;
      exclusionReason = "Durch Ausschluss-RegEx ausgeschlossen";
      excludedByRegex += 1;
    }

    return {
      id: row.id,
      vorname: normalizeString(row.vorname),
      name: normalizeString(row.name),
      displayName: buildDisplayName(row),
      email,
      gruppe: row.gruppe,
      status: normalizeString(row.status),
      hausvereinsmitglied: Boolean(row.hausvereinsmitglied),
      excluded,
      exclusionReason,
    } satisfies RundmailRecipientPreview;
  });

  const sendable = recipients.filter((recipient) => !recipient.excluded);
  const excluded = recipients.filter((recipient) => recipient.excluded);

  return {
    regexSource: (excludeRegexSource || "").trim() || null,
    recipients,
    sendable,
    excluded,
    summary: {
      matchingMembers: rows.length,
      sendable: sendable.length,
      missingEmail,
      excludedByRegex,
    },
  };
}
