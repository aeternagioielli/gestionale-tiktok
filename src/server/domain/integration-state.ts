import { z } from "zod";
import { DomainError } from "@/server/domain/errors";

export const integrationStatusSchema = z.enum([
  "NOT_CONFIGURED",
  "CONNECTED",
  "SYNCING",
  "ERROR",
  "DISCONNECTED",
]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;
export type IntegrationRecord = {
  id: string;
  type: string;
  name: string;
  status: IntegrationStatus;
  lastSyncedAt?: Date;
  lastError?: string;
};

export function getIntegrationStatus(
  integrations: IntegrationRecord[],
  type: string,
): IntegrationRecord | undefined {
  return integrations.find((integration) => integration.type === type);
}

function updateIntegration(
  integration: IntegrationRecord | undefined,
  type: string,
  updater: (record: IntegrationRecord) => IntegrationRecord,
): IntegrationRecord {
  if (!integration || integration.type !== type)
    throw new DomainError(`Integrazione ${type} non trovata.`, "INTEGRATION_NOT_FOUND");
  return updater(integration);
}

export function markSyncStarted(
  integration: IntegrationRecord | undefined,
  type: string,
): IntegrationRecord {
  return updateIntegration(integration, type, (record) => ({
    ...record,
    status: "SYNCING",
    lastError: undefined,
  }));
}
export function markSyncCompleted(
  integration: IntegrationRecord | undefined,
  type: string,
  syncedAt = new Date(),
): IntegrationRecord {
  return updateIntegration(integration, type, (record) => ({
    ...record,
    status: "CONNECTED",
    lastSyncedAt: syncedAt,
    lastError: undefined,
  }));
}
export function markSyncFailed(
  integration: IntegrationRecord | undefined,
  type: string,
  error: string,
): IntegrationRecord {
  const message = error.trim();
  if (!message)
    throw new DomainError("L'errore di sincronizzazione è obbligatorio.", "SYNC_ERROR_REQUIRED");
  return updateIntegration(integration, type, (record) => ({
    ...record,
    status: "ERROR",
    lastError: message,
  }));
}
