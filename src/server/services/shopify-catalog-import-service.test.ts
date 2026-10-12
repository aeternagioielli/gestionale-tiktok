import { describe, expect, it, vi } from "vitest";
import { ShopifyDuplicateProductError } from "@/integrations/shopify/shopify.adapter";
import {
  ShopifyCatalogImportError,
  authorizeAeternaCatalogImport,
  prepareAeternaCatalogImport,
  processNextAeternaCatalogItem,
  type CatalogImportDependencies,
} from "@/server/services/shopify-catalog-import-service";
import type { AgentTaskView } from "@/server/services/agent-task-service";

function task(id: string, agent: AgentTaskView["agent"], status: AgentTaskView["status"], description: string | null = null): AgentTaskView {
  return {
    id, agent, status, title: id, description, source: "MANUAL", priority: 20,
    requiresApproval: status === "AWAITING_APPROVAL", approvalReason: null, result: null,
    executionId: null, aiInvocationId: null, parentTaskId: null,
    createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z",
  };
}

function dependencies(): CatalogImportDependencies & { tasks: Map<string, AgentTaskView>; audit: ReturnType<typeof vi.fn> } {
  const tasks = new Map<string, AgentTaskView>();
  let count = 0;
  const createTask = vi.fn(async (input: { agent: AgentTaskView["agent"]; risk: string; description?: string; parentTaskId?: string }) => {
    const id = "c" + String(count++).padStart(24, "a");
    const stored = task(id, input.agent, input.risk === "PUBLIC_SHOPIFY_CHANGE" ? "AWAITING_APPROVAL" : "QUEUED", input.description ?? null);
    stored.parentTaskId = input.parentTaskId ?? null;
    tasks.set(id, stored);
    return { task: stored, created: true };
  });
  const transitionTask = vi.fn(async ({ taskId, status, result }: { taskId: string; status: AgentTaskView["status"]; result?: string | null }) => {
    const current = tasks.get(taskId);
    if (!current) throw new Error("missing");
    const updated = { ...current, status, ...(result !== undefined ? { result } : {}) };
    tasks.set(taskId, updated);
    return updated;
  });
  const audit = vi.fn(async () => undefined);
  return {
    tasks,
    audit,
    createTask: createTask as CatalogImportDependencies["createTask"],
    transitionTask: transitionTask as CatalogImportDependencies["transitionTask"],
    claimTask: vi.fn(async ({ taskId }: { taskId: string }) => {
      const current = tasks.get(taskId);
      if (!current || current.status !== "QUEUED") return null;
      const updated = { ...current, status: "RUNNING" as const };
      tasks.set(taskId, updated);
      return updated;
    }) as CatalogImportDependencies["claimTask"],
    approveAndClaimTask: vi.fn(async ({ taskId }: { taskId: string }) => {
      const current = tasks.get(taskId);
      if (!current || current.status !== "AWAITING_APPROVAL") return null;
      const updated = { ...current, status: "RUNNING" as const };
      tasks.set(taskId, updated);
      return updated;
    }) as CatalogImportDependencies["approveAndClaimTask"],
    getTask: async (id) => tasks.get(id) ?? null,
    listChildren: async (id) => [...tasks.values()].filter((entry) => entry.parentTaskId === id).sort((a, b) => a.priority - b.priority),
    writeAudit: audit,
    createDraftProduct: vi.fn(async (input, onProductCreated) => {
      const variant = input.variants[0];
      expect(variant?.price).toBeNull();
      await onProductCreated?.({ productId: "gid://shopify/Product/101", handle: input.handle });
      return {
        productId: "gid://shopify/Product/101",
        handle: input.handle,
        variantIds: ["gid://shopify/ProductVariant/101"],
      };
    }) as CatalogImportDependencies["createDraftProduct"],
    isDatabaseConfigured: () => true,
  };
}

describe("AETERNA catalog import", () => {
  it("creates one approval-gated batch with exactly 18 persisted items", async () => {
    const deps = dependencies();
    const result = await prepareAeternaCatalogImport(deps);
    expect(result.batch.status).toBe("AWAITING_APPROVAL");
    expect(result.items).toHaveLength(18);
    expect(result.items.map((item) => item.sku)).toContain("COL-001");
    expect(result.items.map((item) => item.sku)).toContain("ORE-002");
  });

  it("requires an explicit approval before a sequential step", async () => {
    const deps = dependencies();
    const batch = await prepareAeternaCatalogImport(deps);
    await expect(processNextAeternaCatalogItem(batch.batch.id, deps)).rejects.toBeInstanceOf(ShopifyCatalogImportError);
    expect(batch.items.every((item) => item.status === "QUEUED")).toBe(true);
  });

  it("creates one price-undefined DRAFT per request without inventing commercial data", async () => {
    const deps = dependencies();
    const batch = await prepareAeternaCatalogImport(deps);
    await authorizeAeternaCatalogImport(batch.batch.id, deps);
    const afterOne = await processNextAeternaCatalogItem(batch.batch.id, deps);
    expect(afterOne.totals.draftCreated).toBe(1);
    expect(afterOne.totals.queued).toBe(17);
    expect(afterOne.items[0]?.message).toMatch(/^DRAFT_CREATED:/);
    expect(afterOne.items[0]?.message).toContain("PRICE_UNDEFINED");
    expect(deps.createDraftProduct).toHaveBeenCalledTimes(1);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ event: "STEP_COMPLETED" }));
  });

  it("resumes from the stored queue without duplicating an already processed item", async () => {
    const deps = dependencies();
    const batch = await prepareAeternaCatalogImport(deps);
    await authorizeAeternaCatalogImport(batch.batch.id, deps);
    await processNextAeternaCatalogItem(batch.batch.id, deps);
    const resumed = await processNextAeternaCatalogItem(batch.batch.id, deps);
    expect(resumed.totals.draftCreated).toBe(2);
    expect(resumed.totals.queued).toBe(16);
    expect(new Set(resumed.items.map((item) => item.sku)).size).toBe(18);
  });

  it("recovers an interrupted claimed item without retrying a Shopify write", async () => {
    const deps = dependencies();
    const batch = await prepareAeternaCatalogImport(deps);
    await authorizeAeternaCatalogImport(batch.batch.id, deps);
    const interrupted = [...deps.tasks.values()].find(
      (entry) => entry.parentTaskId === batch.batch.id && entry.status === "QUEUED",
    );
    if (!interrupted) throw new Error("catalog task missing");
    deps.tasks.set(interrupted.id, { ...interrupted, status: "RUNNING" });
    const resumed = await processNextAeternaCatalogItem(batch.batch.id, deps);
    expect(resumed.totals.failed).toBe(1);
    expect(resumed.totals.queued).toBe(17);
    expect(resumed.items[0]?.message).toContain("non e stato ritentato automaticamente");
    expect(deps.createDraftProduct).not.toHaveBeenCalled();
  });

  it("records an existing remote product without a second write", async () => {
    const deps = dependencies();
    deps.createDraftProduct = vi.fn(async () => {
      throw new ShopifyDuplicateProductError("gid://shopify/Product/77");
    }) as CatalogImportDependencies["createDraftProduct"];
    const batch = await prepareAeternaCatalogImport(deps);
    await authorizeAeternaCatalogImport(batch.batch.id, deps);
    const result = await processNextAeternaCatalogItem(batch.batch.id, deps);
    expect(result.totals.alreadyPresent).toBe(1);
    expect(result.items[0]?.message).toContain("ALREADY_PRESENT:gid://shopify/Product/77");
  });

  it("marks an uncertain post-write result as failed and never retries it automatically", async () => {
    const deps = dependencies();
    deps.createDraftProduct = vi.fn(async (_input, onProductCreated) => {
      await onProductCreated?.({ productId: "gid://shopify/Product/88", handle: "collana-orbis" });
      throw new Error("timeout");
    }) as CatalogImportDependencies["createDraftProduct"];
    const batch = await prepareAeternaCatalogImport(deps);
    await authorizeAeternaCatalogImport(batch.batch.id, deps);
    const result = await processNextAeternaCatalogItem(batch.batch.id, deps);
    expect(result.totals.failed).toBe(1);
    expect(result.items[0]?.message).toContain("WRITE_OUTCOME_UNKNOWN");
    expect(deps.createDraftProduct).toHaveBeenCalledTimes(1);
  });
});
