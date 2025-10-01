import { PrismaClient } from "@/generated/prisma";

// Verhindert Hot-Reload Mehrfachinstanzen im Dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV === "development") globalForPrisma.prisma = prisma;

