import { describe, expect, it } from "vitest";
import {
  markSyncCompleted,
  markSyncFailed,
  markSyncStarted,
  getIntegrationStatus,
  type IntegrationRecord,
} from "@/server/domain/integration-state";

const shopify: IntegrationRecord = {
  id: "integration-1",
  type: "SHOPIFY",
  name: "Shopify",
  status: "NOT_CONFIGURED",
};

describe("Integration State", () => {
  it("keeps integrations explicitly not configured", () => {
    expect(getIntegrationStatus([shopify], "SHOPIFY")?.status).toBe("NOT_CONFIGURED");
    expect(getIntegrationStatus([shopify], "META_ADS")).toBeUndefined();
  });

  it("tracks sync lifecycle and errors", () => {
    expect(markSyncStarted(shopify, "SHOPIFY").status).toBe("SYNCING");
    const connected = markSyncCompleted(
      markSyncStarted(shopify, "SHOPIFY"),
      "SHOPIFY",
      new Date("2026-01-01"),
    );
    expect(connected.status).toBe("CONNECTED");
    expect(markSyncFailed(connected, "SHOPIFY", "Timeout")).toMatchObject({
      status: "ERROR",
      lastError: "Timeout",
    });
  });
});
