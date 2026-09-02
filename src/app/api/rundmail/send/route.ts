import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRundmail } from "@/lib/mitglieder/auth";
import type { MitgliederFilters } from "@/lib/mitglieder/filters";
import { parseMultiValue } from "@/lib/mitglieder/filters";
import { prepareAttachments } from "@/lib/rundmail/attachments";
import { sendRundmail } from "@/lib/rundmail/mailer";
import { findRundmailRecipients } from "@/lib/rundmail/recipients";

export const runtime = "nodejs";

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: string): boolean {
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "on";
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

function parseFilters(formData: FormData): MitgliederFilters {
  const hvmRaw = getString(formData, "hvm");
  return {
    gruppe: parseMultiValue(getString(formData, "gruppe")).map((value) => value.slice(0, 1)),
    status: parseMultiValue(getString(formData, "status")),
    hvm: hvmRaw === "yes" || hvmRaw === "no" ? hvmRaw : null,
  };
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRundmail(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const formData = await req.formData();
    const subject = getString(formData, "subject");
    const content = getString(formData, "content");
    const excludeRegex = getString(formData, "excludeRegex");
    const skipPdfDownload = parseBoolean(getString(formData, "skipPdfDownload"));
    const batchSize = parsePositiveInt(getString(formData, "batchSize"), Number(process.env.RUNDMAIL_BATCH_SIZE || "1"));
    const hideRecipients = parseBoolean(
      getString(formData, "hideRecipients") || process.env.RUNDMAIL_HIDE_RECIPIENTS || "true",
    );
    const delayMs = parseNonNegativeInt(getString(formData, "delayMs"), Number(process.env.RUNDMAIL_DELAY_MS || "0"));

    if (!subject) return NextResponse.json({ error: "Betreff fehlt" }, { status: 400 });
    if (!content) return NextResponse.json({ error: "Inhalt fehlt" }, { status: 400 });

    const filters = parseFilters(formData);
    const recipientsResult = await findRundmailRecipients(filters, excludeRegex || null);
    if (!recipientsResult.sendable.length) {
      return NextResponse.json({ error: "Keine versendbaren Empfänger gefunden" }, { status: 400 });
    }

    const files = formData.getAll("attachments").filter((value): value is File => value instanceof File);
    const attachments = await prepareAttachments(files);

    const sender = {
      keycloakId: auth.token.user?.sub || null,
      email: auth.token.user?.email || null,
      name: auth.token.user?.name || null,
      username: auth.token.user?.preferred_username || null,
    };

    const mail = await prisma.rundmail.create({
      data: {
        senderKeycloakId: sender.keycloakId,
        senderEmail: sender.email,
        senderName: sender.name,
        senderUsername: sender.username,
        subject,
        content,
        excludeRegex: excludeRegex || null,
        skipPdfDownload,
        attachments: attachments.length ? {
          create: attachments.map((attachment) => ({
            attachmentId: attachment.attachmentId,
            fileName: attachment.fileName,
          })),
        } : undefined,
      },
    });

    let sent = 0;
    let failed = 0;
    const failures: Array<{ recipientId: number; email: string; error: string }> = [];
    const recipientRows: Array<{
      rundmailId: number;
      personId: number;
      email: string;
      recipientName: string;
      deliveryStatus: string;
      errorMessage: string | null;
    }> = [];

    for (let index = 0; index < recipientsResult.sendable.length; index += batchSize) {
      const batch = recipientsResult.sendable.slice(index, index + batchSize);
      const recipientAddresses = batch.map((recipient) => recipient.email);
      try {
        await sendRundmail({
          to: recipientAddresses,
          subject,
          content,
          attachments,
          sender: { email: sender.email, name: sender.name, username: sender.username },
          hideRecipients,
        });

        for (const recipient of batch) {
          sent += 1;
          recipientRows.push({
            rundmailId: mail.id,
            personId: recipient.id,
            email: recipient.email,
            recipientName: recipient.displayName,
            deliveryStatus: "sent",
            errorMessage: null,
          });
        }
      } catch (error) {
        const message = truncateError(error);
        for (const recipient of batch) {
          failed += 1;
          failures.push({ recipientId: recipient.id, email: recipient.email, error: message });
          recipientRows.push({
            rundmailId: mail.id,
            personId: recipient.id,
            email: recipient.email,
            recipientName: recipient.displayName,
            deliveryStatus: "failed",
            errorMessage: message,
          });
        }
      }

      const hasNextBatch = index + batchSize < recipientsResult.sendable.length;
      if (hasNextBatch && delayMs > 0) {
        await wait(delayMs);
      }
    }

    if (recipientRows.length) {
      await prisma.rundmailRecipient.createMany({ data: recipientRows });
    }

    return NextResponse.json({
      ok: failed === 0,
      mailId: mail.id,
      attempted: recipientsResult.sendable.length,
      sent,
      failed,
      summary: recipientsResult.summary,
      failures,
      pdfUrl: `/api/rundmail/${mail.id}/pdf`,
      skipPdfDownload,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
