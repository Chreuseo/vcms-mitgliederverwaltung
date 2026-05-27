import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRundmail } from "@/lib/mitglieder/auth";
import { generateRundmailPdf } from "@/lib/rundmail/pdf";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRundmail(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await context.params;
  const mailId = Number(id);
  if (!Number.isInteger(mailId) || mailId <= 0) {
    return NextResponse.json({ error: "Ungültige Rundmail-ID" }, { status: 400 });
  }

  const mail = await prisma.rundmail.findUnique({
    where: { id: mailId },
    include: {
      recipients: { orderBy: [{ recipientName: "asc" }, { id: "asc" }] },
      attachments: {
        include: { attachment: true },
        orderBy: [{ fileName: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!mail) {
    return NextResponse.json({ error: "Rundmail nicht gefunden" }, { status: 404 });
  }

  const pdf = await generateRundmailPdf({
    id: mail.id,
    createdAt: mail.createdAt,
    senderName: mail.senderName,
    senderEmail: mail.senderEmail,
    senderUsername: mail.senderUsername,
    subject: mail.subject,
    content: mail.content,
    excludeRegex: mail.excludeRegex,
    attachments: mail.attachments.map((attachment) => ({
      fileName: attachment.fileName,
      size: attachment.attachment.size,
    })),
    recipients: mail.recipients.map((recipient) => ({
      displayName: recipient.recipientName || `#${recipient.personId}`,
      email: recipient.email,
      deliveryStatus: recipient.deliveryStatus,
      errorMessage: recipient.errorMessage,
    })),
  });

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="rundmail-${mail.id}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

