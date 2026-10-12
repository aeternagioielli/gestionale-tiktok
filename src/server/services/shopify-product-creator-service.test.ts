import { describe, expect, it, vi } from "vitest";
import { ShopifyDuplicateProductError, ShopifyWriteAccessError } from "@/integrations/shopify/shopify.adapter";
import {
  createApprovedShopifyDraft,
  createShopifyProductProposal,
  type ShopifyProductCreatorDependencies,
} from "@/server/services/shopify-product-creator-service";
import type { AgentTaskView } from "@/server/services/agent-task-service";

const facts = {
  sourceReference: "supplier-sheet-2026-10-12",
  productName: "AETERNA Silver Ring",
  productType: "Jewelry",
  factualDescription: "A verified sterling silver ring with a polished surface.",
  materials: ["Sterling silver"],
  variants: [{ title: "Small", sku: "AET-RING-S", price: "89.00", optionValues: [{ optionName: "Size", value: "Small" }] }],
  images: [{ sourceUrl: "https://assets.example.test/ring.jpg", altText: "Silver ring" }],
};

function task(id: string, agent: AgentTaskView["agent"], status: AgentTaskView["status"], description: string | null = null): AgentTaskView {
  return { id, agent, status, title: id, description, source: "MANUAL", priority: 30, requiresApproval: status === "AWAITING_APPROVAL", approvalReason: null, result: null, executionId: null, aiInvocationId: null, parentTaskId: null, createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z" };
}

function dependencies(): ShopifyProductCreatorDependencies & { tasks: Map<string, AgentTaskView>; createDraft: ReturnType<typeof vi.fn> } {
  const tasks = new Map<string, AgentTaskView>();
  let count = 0;
  const createTask = vi.fn(async (input: { agent: AgentTaskView["agent"]; risk: string; description?: string; parentTaskId?: string }) => {
    const id = `cmv5c1uvj0000${count++}acyj19bwyr6`;
    const stored = task(id, input.agent, input.risk === "PUBLIC_SHOPIFY_CHANGE" ? "AWAITING_APPROVAL" : "QUEUED", input.description ?? null);
    stored.parentTaskId = input.parentTaskId ?? null;
    tasks.set(id, stored);
    return { task: stored, created: true };
  });
  const transitionTask = vi.fn(async ({ taskId, status, result }: { taskId: string; status: AgentTaskView["status"]; result?: string | null }) => {
    const current = tasks.get(taskId);
    if (!current) throw new Error("missing task");
    const updated = { ...current, status, ...(result !== undefined ? { result } : {}) };
    tasks.set(taskId, updated); return updated;
  });
  const createDraft = vi.fn(async (_product, onCreated) => {
    await onCreated?.({ productId: "gid://shopify/Product/99", handle: "aeterna-silver-ring" });
    return { productId: "gid://shopify/Product/99", handle: "aeterna-silver-ring", variantIds: ["gid://shopify/ProductVariant/10"] };
  });
  return {
    tasks,
    createDraft,
    ai: { generate: vi.fn(async () => ({ text: JSON.stringify({ title: "AETERNA Silver Ring", handle: "aeterna-silver-ring", descriptionHtml: "<p>A polished sterling silver ring.</p>", seoTitle: "AETERNA Sterling Silver Ring", seoDescription: "Discover the polished AETERNA sterling silver ring.", }), model: "test-model", taskType: "seo_analysis" as const, durationMs: 1, invocationId: null, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } })) },
    createTask: createTask as ShopifyProductCreatorDependencies["createTask"],
    transitionTask: transitionTask as ShopifyProductCreatorDependencies["transitionTask"],
    claimTask: vi.fn(async ({ taskId }: { taskId: string }) => { const current = tasks.get(taskId)!; const updated = { ...current, status: "RUNNING" as const }; tasks.set(taskId, updated); return updated; }) as ShopifyProductCreatorDependencies["claimTask"],
    approveAndClaimTask: vi.fn(async ({ taskId }: { taskId: string }) => { const current = tasks.get(taskId); if (!current || current.status !== "AWAITING_APPROVAL") return null; const updated = { ...current, status: "RUNNING" as const }; tasks.set(taskId, updated); return updated; }) as ShopifyProductCreatorDependencies["approveAndClaimTask"],
    getTask: async (id) => tasks.get(id) ?? null,
    findProposalTask: async () => null,
    createDraftProduct: createDraft,
    writeAudit: vi.fn(async () => undefined),
    isDatabaseConfigured: () => true,
  };
}

describe("Shopify product creator", () => {
  it("stores an approval-gated proposal and never calls Shopify while preparing it", async () => {
    const deps = dependencies();
    const result = await createShopifyProductProposal(facts, deps);
    expect(result.proposalTask.status).toBe("AWAITING_APPROVAL");
    expect(result.proposal.product.variants[0]?.price).toBe("89.00");
    expect(deps.createDraft).not.toHaveBeenCalled();
  });

  it("creates one DRAFT only after approval and records its Shopify ID", async () => {
    const deps = dependencies();
    const proposal = await createShopifyProductProposal(facts, deps);
    const created = await createApprovedShopifyDraft(proposal.proposalTask.id, deps);
    expect(deps.createDraft).toHaveBeenCalledTimes(1);
    expect(created.task.status).toBe("COMPLETED");
    expect(created.task.result).toContain("gid://shopify/Product/99");
    expect(created.task.result).toContain("DRAFT");
  });

  it("does not create a draft twice after approval has been claimed", async () => {
    const deps = dependencies();
    const proposal = await createShopifyProductProposal(facts, deps);
    await createApprovedShopifyDraft(proposal.proposalTask.id, deps);
    await expect(createApprovedShopifyDraft(proposal.proposalTask.id, deps)).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    expect(deps.createDraft).toHaveBeenCalledTimes(1);
  });

  it("records a missing write scope as a failed task without publishing anything", async () => {
    const deps = dependencies();
    const proposal = await createShopifyProductProposal(facts, deps);
    deps.createDraft.mockRejectedValueOnce(new ShopifyWriteAccessError());
    await expect(createApprovedShopifyDraft(proposal.proposalTask.id, deps)).rejects.toMatchObject({ code: "WRITE_SCOPE_MISSING" });
    expect(deps.tasks.get(proposal.proposalTask.id)?.status).toBe("FAILED");
  });

  it("rejects a remote duplicate without retrying a write", async () => {
    const deps = dependencies();
    const proposal = await createShopifyProductProposal(facts, deps);
    deps.createDraft.mockRejectedValueOnce(new ShopifyDuplicateProductError());
    await expect(createApprovedShopifyDraft(proposal.proposalTask.id, deps)).rejects.toMatchObject({ code: "DUPLICATE_PRODUCT" });
    expect(deps.createDraft).toHaveBeenCalledTimes(1);
  });
});
