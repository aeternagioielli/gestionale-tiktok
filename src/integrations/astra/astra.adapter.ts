import type { ExternalIntegrationAdapter, IntegrationHealth } from "@/integrations/types";
import { getOpenAiConfig } from "@/server/ai/config";

export class AstraAdapter implements ExternalIntegrationAdapter {
  readonly provider = "openai_astra";

  async getHealth(): Promise<IntegrationHealth> {
    return {
      provider: this.provider,
      status: getOpenAiConfig().apiKey ? "configured" : "not_configured",
    };
  }
}
