import type { ExternalIntegrationAdapter, IntegrationHealth } from "@/integrations/types";

export class AstraAdapter implements ExternalIntegrationAdapter {
  readonly provider = "openai_astra";

  async getHealth(): Promise<IntegrationHealth> {
    return { provider: this.provider, status: "not_configured" };
  }
}
