import { IntegrationStatus as PrismaIntegrationStatus } from "@/generated/prisma/enums";
import { getDatabaseClient } from "@/server/db";
import {
  markSyncCompleted,
  markSyncFailed,
  markSyncStarted,
} from "@/server/domain/integration-state";

export async function getPersistedIntegrationStatus(type: string) {
  return getDatabaseClient().integration.findFirst({ where: { type: type as never } });
}

export async function markPersistedSyncStarted(id: string) {
  const db = getDatabaseClient();
  const integration = await db.integration.findUniqueOrThrow({ where: { id } });
  const updated = markSyncStarted(
    {
      ...integration,
      lastSyncedAt: integration.lastSyncedAt ?? undefined,
      type: integration.type,
      status: integration.status,
      lastError: integration.lastError ?? undefined,
    },
    integration.type,
  );
  return db.integration.update({
    where: { id },
    data: { status: updated.status as PrismaIntegrationStatus, lastError: null },
  });
}

export async function markPersistedSyncCompleted(id: string, syncedAt = new Date()) {
  const db = getDatabaseClient();
  const integration = await db.integration.findUniqueOrThrow({ where: { id } });
  const updated = markSyncCompleted(
    {
      ...integration,
      lastSyncedAt: integration.lastSyncedAt ?? undefined,
      type: integration.type,
      status: integration.status,
      lastError: integration.lastError ?? undefined,
    },
    integration.type,
    syncedAt,
  );
  return db.integration.update({
    where: { id },
    data: {
      status: updated.status as PrismaIntegrationStatus,
      lastSyncedAt: syncedAt,
      lastError: null,
    },
  });
}

export async function markPersistedSyncFailed(id: string, error: string) {
  const db = getDatabaseClient();
  const integration = await db.integration.findUniqueOrThrow({ where: { id } });
  const updated = markSyncFailed(
    {
      ...integration,
      lastSyncedAt: integration.lastSyncedAt ?? undefined,
      type: integration.type,
      status: integration.status,
      lastError: integration.lastError ?? undefined,
    },
    integration.type,
    error,
  );
  return db.integration.update({
    where: { id },
    data: { status: updated.status as PrismaIntegrationStatus, lastError: updated.lastError },
  });
}
