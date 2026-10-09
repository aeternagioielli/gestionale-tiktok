import type { ExternalIntegrationAdapter, IntegrationHealth } from "@/integrations/types";

export class MetaAdsAdapter implements ExternalIntegrationAdapter {
  readonly provider = "meta_ads";

  async getHealth(): Promise<IntegrationHealth> {
    return { provider: this.provider, status: "not_configured" };
  }
}
