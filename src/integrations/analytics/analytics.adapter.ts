import type { ExternalIntegrationAdapter, IntegrationHealth } from "@/integrations/types";

export class AnalyticsAdapter implements ExternalIntegrationAdapter {
  readonly provider = "analytics";

  async getHealth(): Promise<IntegrationHealth> {
    return { provider: this.provider, status: "not_configured" };
  }
}
