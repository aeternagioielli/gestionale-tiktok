export type IntegrationStatus = "not_configured" | "configured" | "error";

export type IntegrationHealth = {
  provider: string;
  status: IntegrationStatus;
  lastSyncedAt?: Date;
};

export interface ExternalIntegrationAdapter {
  readonly provider: string;
  getHealth(): Promise<IntegrationHealth>;
}
