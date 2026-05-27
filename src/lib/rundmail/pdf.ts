import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

interface PdfRecipient {
  displayName: string;
  email: string;
  deliveryStatus: string;
  errorMessage?: string | null;
}

interface PdfAttachment {
  fileName: string;
  size: number;
}

interface RundmailPdfData {
  id: number;
  createdAt: Date;
  senderName: string | null;
  senderEmail: string | null;
  senderUsername: string | null;
  subject: string;
  content: string;
  excludeRegex: string | null;
  attachments: PdfAttachment[];
  recipients: PdfRecipient[];
}

interface PdfCursor {
  page: PDFPage;
  y: number;
}

const PAGE_SIZE = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const FONT_SIZE = 11;
const LINE_HEIGHT = 15;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function wrapLine(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);

    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }

    let rest = word;
    while (rest.length) {
      let length = rest.length;
      while (length > 1 && font.widthOfTextAtSize(rest.slice(0, length), fontSize) > maxWidth) {
        length -= 1;
      }
      lines.push(rest.slice(0, length));
      rest = rest.slice(length);
    }
    current = "";
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function createPage(doc: PDFDocument): PdfCursor {
  const page = doc.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
  return { page, y: PAGE_SIZE.height - MARGIN };
}

function ensureSpace(doc: PDFDocument, cursor: PdfCursor, lines = 1): PdfCursor {
  if (cursor.y - lines * LINE_HEIGHT >= MARGIN) return cursor;
  return createPage(doc);
}

function drawTextBlock(doc: PDFDocument, cursor: PdfCursor, font: PDFFont, text: string, options?: { indent?: number; color?: ReturnType<typeof rgb> }): PdfCursor {
  const indent = options?.indent || 0;
  const maxWidth = PAGE_SIZE.width - MARGIN * 2 - indent;
  const paragraphs = text.split(/\r?\n/);
  let nextCursor = cursor;

  for (const paragraph of paragraphs) {
    const lines = wrapLine(paragraph, font, FONT_SIZE, maxWidth);
    for (const line of lines) {
      nextCursor = ensureSpace(doc, nextCursor);
      nextCursor.page.drawText(line, {
        x: MARGIN + indent,
        y: nextCursor.y,
        size: FONT_SIZE,
        font,
        color: options?.color || rgb(0, 0, 0),
      });
      nextCursor = { ...nextCursor, y: nextCursor.y - LINE_HEIGHT };
    }
    nextCursor = { ...nextCursor, y: nextCursor.y - 4 };
  }

  return nextCursor;
}

export async function generateRundmailPdf(data: RundmailPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let cursor = createPage(doc);
  cursor.page.drawText(`Rundmail #${data.id}`, {
    x: MARGIN,
    y: cursor.y,
    size: 20,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursor = { ...cursor, y: cursor.y - 30 };

  const metaLines = [
    `Versandt am: ${formatDate(data.createdAt)}`,
    `Absender: ${data.senderName || data.senderUsername || "Unbekannt"}${data.senderEmail ? ` <${data.senderEmail}>` : ""}`,
    `Betreff: ${data.subject}`,
    `Ausschluss-RegEx: ${data.excludeRegex || "—"}`,
    `Anhänge: ${data.attachments.length ? data.attachments.map((attachment) => `${attachment.fileName} (${formatBytes(attachment.size)})`).join(", ") : "Keine"}`,
    `Empfänger: ${data.recipients.length}`,
  ];

  for (const line of metaLines) {
    cursor = drawTextBlock(doc, cursor, regular, line);
  }

  cursor = { ...cursor, y: cursor.y - 8 };
  cursor.page.drawText("Inhalt", {
    x: MARGIN,
    y: cursor.y,
    size: 14,
    font: bold,
  });
  cursor = { ...cursor, y: cursor.y - 22 };
  cursor = drawTextBlock(doc, cursor, regular, data.content);

  cursor = ensureSpace(doc, { ...cursor, y: cursor.y - 10 }, 2);
  cursor.page.drawText("Empfängerliste", {
    x: MARGIN,
    y: cursor.y,
    size: 14,
    font: bold,
  });
  cursor = { ...cursor, y: cursor.y - 22 };

  for (const recipient of data.recipients) {
    const line = `${recipient.displayName} <${recipient.email}> — ${recipient.deliveryStatus}${recipient.errorMessage ? ` (${recipient.errorMessage})` : ""}`;
    cursor = drawTextBlock(doc, cursor, regular, line);
  }

  return doc.save();
}

