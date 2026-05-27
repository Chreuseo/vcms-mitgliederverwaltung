import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

const DEFAULT_ATTACHMENT_DIR = path.join("var", "rundmail-attachments");

export interface PreparedAttachment {
  attachmentId: number;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  storagePath: string;
  buffer: Buffer;
}

function getAttachmentBaseDir(): string {
  const configured = (process.env.RUNDMAIL_ATTACHMENT_DIR || "").trim();
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), DEFAULT_ATTACHMENT_DIR);
}

function getStoredFilePath(sha256: string): { absolutePath: string; relativePath: string } {
  const baseDir = getAttachmentBaseDir();
  const absolutePath = path.join(baseDir, sha256);
  const relativePath = path.relative(process.cwd(), absolutePath);
  return { absolutePath, relativePath };
}

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const sanitized = trimmed.replace(/[\\/\u0000-\u001f]+/g, "_");
  return sanitized || "anhang";
}

async function ensureFileOnDisk(absolutePath: string, buffer: Buffer): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  try {
    await access(absolutePath);
  } catch {
    await writeFile(absolutePath, buffer);
  }
}

export async function prepareAttachments(files: File[]): Promise<PreparedAttachment[]> {
  const prepared: PreparedAttachment[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (!file.size) continue;

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (seen.has(sha256)) continue;
    seen.add(sha256);

    const { absolutePath, relativePath } = getStoredFilePath(sha256);
    await ensureFileOnDisk(absolutePath, buffer);

    const attachment = await prisma.rundmailAttachment.upsert({
      where: { sha256 },
      update: {},
      create: {
        sha256,
        storagePath: relativePath,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      },
    });

    prepared.push({
      attachmentId: attachment.id,
      fileName: sanitizeFileName(file.name || "anhang"),
      mimeType: attachment.mimeType || file.type || "application/octet-stream",
      size: attachment.size,
      sha256,
      storagePath: attachment.storagePath,
      buffer,
    });
  }

  return prepared;
}


