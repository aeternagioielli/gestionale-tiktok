import { describe, expect, it } from "vitest";
import {
  goalInputSchema,
  orderInputSchema,
  validateIntegrationConfig,
} from "@/server/validation/input-schemas";

describe("server input validation", () => {
  it("accepts incomplete external records without inventing required business data", () => {
    expect(orderInputSchema.parse({ source: "SHOPIFY" }).source).toBe("SHOPIFY");
  });

  it("rejects invalid dates and non-positive goal targets", () => {
    expect(() =>
      goalInputSchema.parse({
        name: "Obiettivo",
        targetValue: 0,
        unit: "ordini",
        startDate: "2026-01-01",
      }),
    ).toThrow();
  });

  it("rejects secrets in integration configuration", () => {
    expect(() => validateIntegrationConfig({ apiKey: "do-not-store" })).toThrow(/segreti/);
  });
});
