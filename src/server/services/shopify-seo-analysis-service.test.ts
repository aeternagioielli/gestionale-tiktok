import { describe, expect, it, vi } from "vitest";
import type { ShopifyCatalogProduct } from "@/integrations/shopify/shopify.types";
import type { AgentTaskView } from "@/server/services/agent-task-service";
import {
  ShopifySeoAnalysisError,
  buildShopifySeoPrompt,
  runShopifySeoAnalysis,
  type ShopifySeoAnalysisDependencies,
} from "@/server/services/shopify-seo-analysis-service";

const catalog: ShopifyCatalogProduct[] = [{
  externalId: "gid://shopify/Product/1",
  title: "AETERNA Necklace",
  handle: "aeterna-necklace",
  descriptionHtml: "<p>Real catalog description</p>",
  seoTitle: null,
  seoDescription: null,
  imageUrl: "https://cdn.shopify.com/necklace.jpg",
  imageAltText: "Necklace",
  images: [{ url: "https://cdn.shopify.com/necklace.jpg", altText: "Necklace" }],
  status: "ACTIVE",
  productType: "Jewelry",
  updatedAt: new Date("2026-10-12T09:00:00.000Z"),
  variants: [{ externalId: "gid://shopify/ProductVariant/1", title: "Default", sku: "NECK-1", price: 89, availableQty: 4 }],
  availableQty: 4,
}];

function task(id: string, agent: AgentTaskView["agent"], status: AgentTaskView["status"]): AgentTaskView {
  return {
    id,
    agent,
    title: "Task",
    description: null,
    source: "MANUAL",
    priority: 20,
    status,
    requiresApproval: status === "AWAITING_APPROVAL",
    approvalReason: status === "AWAITING_APPROVAL" ? "Approval required" : null,
    result: null,
    executionId: null,
    aiInvocationId: null,
    parentTaskId: null,
    createdAt: "2026-10-12T09:00:00.000Z",
    updatedAt: "2026-10-12T09:00:00.000Z",
  };
}

function dependencies(overrides: Partial<ShopifySeoAnalysisDependencies> = {}): ShopifySeoAnalysisDependencies {
  let sequence = 0;
  return {
    isDatabaseConfigured: () => true,
    fetchCatalog: vi.fn().mockResolvedValue(catalog),
    ai: {
      generate: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          catalogSummary: "One active Shopify product was reviewed.",
          limitations: "Only the provided catalog data was reviewed.",
          proposals: [{
            productExternalId: "gid://shopify/Product/1",
            seoTitle: "AETERNA Handmade Necklace",
            seoDescription: "Discover the AETERNA handmade necklace, crafted for timeless everyday elegance.",
            rationale: "Uses the real product name and avoids unsupported claims.",
          }],
        }),
        model: "gpt-6.1-sol",
        taskType: "seo_analysis",
        durationMs: 10,
        invocationId: "invocation-1",
        usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      }),
    },
    createTask: vi.fn().mockImplementation(async (input: { agent: AgentTaskView["agent"]; risk: string; parentTaskId?: string }) => {
      sequence += 1;
      const created = task(`task-${sequence}`, input.agent, input.risk === "PUBLIC_SHOPIFY_CHANGE" ? "AWAITING_APPROVAL" : "QUEUED");
      return { task: { ...created, parentTaskId: input.parentTaskId ?? null }, created: true };
    }),
    transitionTask: vi.fn().mockImplementation(async (input: { taskId: string; status: AgentTaskView["status"] }) => task(input.taskId, "LORENZO", input.status)),
    writeAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ShopifySeoAnalysisDependencies;
}

describe("Shopify SEO analysis", () => {
  it("fails before Shopify or OpenAI when persistence is unavailable", async () => {
    const deps = dependencies({ isDatabaseConfigured: () => false });
    await expect(runShopifySeoAnalysis({}, deps)).rejects.toMatchObject({ code: "DATABASE_NOT_CONFIGURED" });
    expect(deps.fetchCatalog).not.toHaveBeenCalled();
    expect(deps.ai.generate).not.toHaveBeenCalled();
  });

  it("uses only real catalog input and persists approval-gated Alessandro proposals", async () => {
    const deps = dependencies();
    const result = await runShopifySeoAnalysis({ now: new Date("2026-10-12T10:00:00.000Z") }, deps);
    expect(result.created).toBe(true);
    expect(result.catalog).toEqual({ totalProducts: 1, activeProducts: 1, analyzedProducts: 1 });
    expect(result.analysisTask.status).toBe("COMPLETED");
    expect(result.proposalTasks).toHaveLength(1);
    expect(result.proposalTasks[0]).toMatchObject({ agent: "ALESSANDRO", status: "AWAITING_APPROVAL", parentTaskId: "task-1" });
    expect(deps.ai.generate).toHaveBeenCalledWith(expect.objectContaining({ taskType: "seo_analysis" }));
    const prompt = vi.mocked(deps.ai.generate).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("AETERNA Necklace");
    expect(prompt).not.toContain("customer@example.com");
    expect(deps.createTask).toHaveBeenCalledWith(expect.objectContaining({ aiInvocationId: "invocation-1", risk: "PUBLIC_SHOPIFY_CHANGE" }));
  });

  it("does not call Shopify or OpenAI again for the same daily analysis", async () => {
    const duplicate = task("existing", "LORENZO", "COMPLETED");
    const deps = dependencies({ createTask: vi.fn().mockResolvedValue({ task: duplicate, created: false }) as never });
    const result = await runShopifySeoAnalysis({ now: new Date("2026-10-12T10:00:00.000Z") }, deps);
    expect(result.created).toBe(false);
    expect(deps.fetchCatalog).not.toHaveBeenCalled();
    expect(deps.ai.generate).not.toHaveBeenCalled();
  });

  it("rejects an AI proposal for a product absent from the real catalog", async () => {
    const deps = dependencies({
      ai: {
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify({ catalogSummary: "Summary", limitations: "Limit", proposals: [{ productExternalId: "gid://shopify/Product/not-real", seoTitle: "Title", seoDescription: "Description", rationale: "Reason" }] }),
          model: "gpt-6.1-sol", taskType: "seo_analysis", durationMs: 1, invocationId: null,
          usage: { inputTokens: null, outputTokens: null, totalTokens: null },
        }),
      },
    });
    await expect(runShopifySeoAnalysis({ now: new Date("2026-10-13T10:00:00.000Z") }, deps)).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
    expect(deps.transitionTask).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED" }));
  });

  it("keeps the prompt explicit about real data and no Shopify mutation", () => {
    const prompt = buildShopifySeoPrompt({ totalProducts: 1, activeProducts: 1, products: [{
      productExternalId: "gid://shopify/Product/1", title: "AETERNA Necklace", handle: "aeterna-necklace", description: "Description", currentSeoTitle: null, currentSeoDescription: null, hasImage: true, imageAltText: "Necklace", imageCount: 1, productType: "Jewelry", variants: [], availableQty: 4, updatedAt: null,
    }] });
    expect(prompt).toContain("Non inventare");
    expect(prompt).toContain("non modificare Shopify");
  });
});
