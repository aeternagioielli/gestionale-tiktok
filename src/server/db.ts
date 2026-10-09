import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";
import { DomainError } from "@/server/domain/errors";

const globalForPrisma = globalThis as unknown as { aeternaPrisma?: PrismaClient };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabaseClient(): PrismaClient {
  if (!process.env.DATABASE_URL)
    throw new DomainError("DATABASE_URL non configurata.", "DATABASE_NOT_CONFIGURED");
  if (globalForPrisma.aeternaPrisma) return globalForPrisma.aeternaPrisma;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production") globalForPrisma.aeternaPrisma = client;
  return client;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    return false;
  }

  try {
    await getDatabaseClient().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
