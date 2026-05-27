import nodemailer, { type Transporter } from "nodemailer";
import type { PreparedAttachment } from "@/lib/rundmail/attachments";

interface MailSender {
  email: string | null;
  name: string | null;
  username?: string | null;
}

interface SendRundmailParams {
  to: string;
  subject: string;
  content: string;
  attachments: PreparedAttachment[];
  sender: MailSender;
}

let transporterPromise: Promise<Transporter> | null = null;

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function getRequiredEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`${name} ist nicht gesetzt`);
  return value;
}

function getOptionalEnv(name: string): string {
  return (process.env[name] || "").trim();
}

function getTransporter(): Promise<Transporter> {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: getRequiredEnv("SMTP_HOST"),
        port: Number(process.env.SMTP_PORT || 587),
        secure: parseBoolean(process.env.SMTP_SECURE, false),
        auth: {
          user: getRequiredEnv("SMTP_USER"),
          pass: getRequiredEnv("SMTP_PASS"),
        },
      }),
    );
  }

  return transporterPromise;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asHtml(content: string): string {
  return escapeHtml(content).replace(/\r?\n/g, "<br />");
}

function extractAddress(fromValue: string): string {
  const match = fromValue.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim();
  return fromValue.trim();
}

function buildFromName(sender: MailSender): string {
  const corporation = getOptionalEnv("Custom_Corporation") || getOptionalEnv("NEXT_PUBLIC_COMPANY") || "VCMS";
  const senderDisplay = sender.name?.trim() || sender.username?.trim() || "Unbekannt";
  return `${corporation} im Auftrag von ${senderDisplay}`;
}

export async function sendRundmail(params: SendRundmailParams): Promise<void> {
  const transporter = await getTransporter();
  const fromRaw = getRequiredEnv("SMTP_FROM");
  const fromAddress = extractAddress(fromRaw);
  const fromName = buildFromName(params.sender);
  const senderEmail = params.sender.email?.trim() || "";
  const senderReplyName = params.sender.name?.trim() || params.sender.username?.trim() || "";
  const replyTo = senderEmail
    ? (senderReplyName ? { name: senderReplyName, address: senderEmail } : senderEmail)
    : undefined;

  await transporter.sendMail({
    from: {
      name: fromName,
      address: fromAddress,
    },
    to: params.to,
    replyTo,
    subject: params.subject,
    text: params.content,
    html: `<div>${asHtml(params.content)}</div>`,
    attachments: params.attachments.map((attachment) => ({
      filename: attachment.fileName,
      content: attachment.buffer,
      contentType: attachment.mimeType,
    })),
  });
}

