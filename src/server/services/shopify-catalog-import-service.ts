import { z } from "zod";
import { AuditAction } from "@/generated/prisma/enums";
import {
  ShopifyAdapter,
  ShopifyDuplicateProductError,
  ShopifyDuplicateSkuError,
} from "@/integrations/shopify/shopify.adapter";
import type { ShopifyDraftProduct } from "@/integrations/shopify/shopify.types";
import { AETERNA_PRODUCT_CATALOG, AETERNA_PRODUCT_CATEGORIES } from "@/lib/aeterna-product-catalog";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";
import {
  approveAndClaimAgentTask,
  claimQueuedAgentTask,
  createAgentTask,
  transitionAgentTask,
  type AgentTaskView,
} from "@/server/services/agent-task-service";

const IMPORT_KEY = "aeterna-catalog-import:v1";
const taskIdSchema = z.string().cuid();

const catalogItemSchema = z.object({
  kind: z.literal("AETERNA_CATALOG_IMPORT_ITEM"),
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: z.enum(AETERNA_PRODUCT_CATEGORIES),
});

type CatalogItem = z.infer<typeof catalogItemSchema>;
type TaskCreator = typeof createAgentTask;
type TaskTransitioner = typeof transitionAgentTask;
type TaskClaimer = typeof claimQueuedAgentTask;
type ApprovalClaimer = typeof approveAndClaimAgentTask;
type DraftProductCreator = Pick<ShopifyAdapter, "createDraftProduct">["createDraftProduct"];

export type CatalogImportItemView = {
  taskId: string;
  sku: string;
  name: string;
  category: string;
  status: "QUEUED" | "RUNNING" | "DRAFT_CREATED" | "ALREADY_PRESENT" | "REQUIRES_INFORMATION" | "FAILED";
  message: string | null;
  updatedAt: string;
};

export type CatalogImportView = {
  batch: AgentTaskView;
  items: CatalogImportItemView[];
  totals: {
    total: number;
    queued: number;
    running: number;
    draftCreated: number;
    alreadyPresent: number;
    requiresInformation: number;
    failed: number;
  };
};

export class ShopifyCatalogImportError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "DATABASE_NOT_CONFIGURED"
      | "IMPORT_NOT_FOUND"
      | "IMPORT_NOT_APPROVED"
      | "IMPORT_FINISHED",
  ) {
    super(message);
    this.name = "ShopifyCatalogImportError";
  }
}

export type CatalogImportDependencies = {
  createTask: TaskCreator;
  transitionTask: TaskTransitioner;
  claimTask: TaskClaimer;
  approveAndClaimTask: ApprovalClaimer;
  getTask: (taskId: string) => Promise<AgentTaskView | null>;
  listChildren: (taskId: string) => Promise<AgentTaskView[]>;
  writeAudit: (input: {
    taskId: string;
    event: "AUTHORIZED" | "STEP_COMPLETED";
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  createDraftProduct: DraftProductCreator;
  isDatabaseConfigured: () => boolean;
};

function mapTask(task: {
  id: string;
  agent: string;
  title: string;
  description: string | null;
  source: "MANUAL" | "AUTOMATIC" | "EVENT";
  priority: number;
  status: string;
  requiresApproval: boolean;
  approvalReason: string | null;
  result: string | null;
  executionId: string | null;
  aiInvocationId: string | null;
  parentTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AgentTaskView {
  return {
    id: task.id,
    agent: task.agent as AgentTaskView["agent"],
    title: task.title,
    description: task.description,
    source: task.source,
    priority: task.priority,
    status: task.status as AgentTaskView["status"],
    requiresApproval: task.requiresApproval,
    approvalReason: task.approvalReason,
    result: task.result,
    executionId: task.executionId,
    aiInvocationId: task.aiInvocationId,
    parentTaskId: task.parentTaskId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function defaultGetTask(taskId: string) {
  const task = await getDatabaseClient().agentTask.findUnique({ where: { id: taskId } });
  return task ? mapTask(task) : null;
}

async function defaultListChildren(taskId: string) {
  const tasks = await getDatabaseClient().agentTask.findMany({
    where: { parentTaskId: taskId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return tasks.map(mapTask);
}

async function defaultWriteAudit(input: {
  taskId: string;
  event: "AUTHORIZED" | "STEP_COMPLETED";
  metadata?: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) return;
  await getDatabaseClient().auditLog.create({
    data: {
      action: AuditAction.OTHER,
      entityType: "ShopifyCatalogImport",
      entityId: input.taskId,
      metadata: { event: input.event, ...(input.metadata ?? {}) },
    },
  });
}

function defaultDependencies(): CatalogImportDependencies {
  const adapter = new ShopifyAdapter();
  return {
    createTask: createAgentTask,
    transitionTask: transitionAgentTask,
    claimTask: claimQueuedAgentTask,
    approveAndClaimTask: approveAndClaimAgentTask,
    getTask: defaultGetTask,
    listChildren: defaultListChildren,
    writeAudit: defaultWriteAudit,
    createDraftProduct: adapter.createDraftProduct.bind(adapter),
    isDatabaseConfigured,
  };
}

function catalogItemToDraft(item: CatalogItem): ShopifyDraftProduct {
  const handle = item.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return {
    // The catalog only establishes identity. These neutral fields make no claim
    // about material, dimensions, benefits, price, inventory, or imagery.
    title: item.name,
    handle,
    descriptionHtml: item.name,
    seoTitle: item.name,
    seoDescription: null,
    productType: item.category,
    materials: [],
    variants: [{
      title: "Default",
      sku: item.sku,
      price: null,
      optionValues: [{ optionName: "Title", value: "Default" }],
    }],
    images: [],
  };
}

function hasPersistedShopifyProduct(task: AgentTaskView): string | null {
  const match = task.result?.match(/^SHOPIFY_PRODUCT_ID:([^;\s]+)/);
  return match?.[1] ?? null;
}

function itemFromTask(task: AgentTaskView): CatalogItem | null {
  try {
    const parsed = catalogItemSchema.safeParse(JSON.parse(task.description ?? ""));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function stateFor(task: AgentTaskView): CatalogImportItemView["status"] {
  if (task.status === "QUEUED") return "QUEUED";
  if (task.status === "RUNNING") return "RUNNING";
  if (task.result?.startsWith("DRAFT_CREATED:")) return "DRAFT_CREATED";
  if (task.result?.startsWith("ALREADY_PRESENT:")) return "ALREADY_PRESENT";
  if (task.result?.startsWith("REQUIRES_INFORMATION:")) return "REQUIRES_INFORMATION";
  return "FAILED";
}

function toView(batch: AgentTaskView, children: AgentTaskView[]): CatalogImportView {
  const items = children.flatMap((task) => {
    const item = itemFromTask(task);
    return item
      ? [{
          taskId: task.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          status: stateFor(task),
          message: task.result,
          updatedAt: task.updatedAt,
        }]
      : [];
  });
  const totals = {
    total: items.length,
    queued: 0,
    running: 0,
    draftCreated: 0,
    alreadyPresent: 0,
    requiresInformation: 0,
    failed: 0,
  };
  for (const item of items) {
    if (item.status === "QUEUED") totals.queued += 1;
    else if (item.status === "RUNNING") totals.running += 1;
    else if (item.status === "DRAFT_CREATED") totals.draftCreated += 1;
    else if (item.status === "ALREADY_PRESENT") totals.alreadyPresent += 1;
    else if (item.status === "REQUIRES_INFORMATION") totals.requiresInformation += 1;
    else totals.failed += 1;
  }
  return { batch, items, totals };
}

async function load(batchId: string, dependencies: CatalogImportDependencies): Promise<CatalogImportView> {
  const batch = await dependencies.getTask(taskIdSchema.parse(batchId));
  if (!batch || batch.agent !== "LORENZO") {
    throw new ShopifyCatalogImportError("Importazione catalogo non trovata.", "IMPORT_NOT_FOUND");
  }
  return toView(batch, await dependencies.listChildren(batch.id));
}

export async function prepareAeternaCatalogImport(
  dependencies: CatalogImportDependencies = defaultDependencies(),
): Promise<CatalogImportView> {
  if (!dependencies.isDatabaseConfigured()) {
    throw new ShopifyCatalogImportError(
      "Database non configurato: impossibile salvare l'importazione.",
      "DATABASE_NOT_CONFIGURED",
    );
  }
  const batch = await dependencies.createTask({
    agent: "LORENZO",
    title: "Importazione catalogo AETERNA su Shopify",
    description: "Autorizzazione unica richiesta per creare fino a 18 bozze Shopify. Nessuna pubblicazione automatica.",
    source: "MANUAL",
    priority: 10,
    risk: "PUBLIC_SHOPIFY_CHANGE",
    dedupeKey: IMPORT_KEY,
  });
  if (batch.created) {
    await Promise.all(
      AETERNA_PRODUCT_CATALOG.map((item, index) =>
        dependencies.createTask({
          agent: "ALESSANDRO",
          title: "Importa " + item.name,
          description: JSON.stringify({ kind: "AETERNA_CATALOG_IMPORT_ITEM", ...item }),
          source: "AUTOMATIC",
          priority: 20 + index,
          risk: "ANALYSIS",
          parentTaskId: batch.task.id,
          dedupeKey: IMPORT_KEY + ":" + item.sku,
        }),
      ),
    );
  }
  return toView(batch.task, await dependencies.listChildren(batch.task.id));
}

export async function getAeternaCatalogImport(
  batchId: string,
  dependencies: CatalogImportDependencies = defaultDependencies(),
): Promise<CatalogImportView> {
  if (!dependencies.isDatabaseConfigured()) {
    throw new ShopifyCatalogImportError("Database non configurato.", "DATABASE_NOT_CONFIGURED");
  }
  return load(batchId, dependencies);
}

export async function getLatestAeternaCatalogImport(): Promise<CatalogImportView | null> {
  if (!isDatabaseConfigured()) return null;
  const batch = await getDatabaseClient().agentTask.findUnique({ where: { dedupeKey: IMPORT_KEY } });
  if (!batch) return null;
  const view = mapTask(batch);
  return toView(view, await defaultListChildren(view.id));
}

export async function authorizeAeternaCatalogImport(
  batchId: string,
  dependencies: CatalogImportDependencies = defaultDependencies(),
): Promise<CatalogImportView> {
  if (!dependencies.isDatabaseConfigured()) {
    throw new ShopifyCatalogImportError("Database non configurato.", "DATABASE_NOT_CONFIGURED");
  }
  const importView = await load(batchId, dependencies);
  if (importView.batch.status === "COMPLETED") {
    throw new ShopifyCatalogImportError("L'importazione e gia conclusa.", "IMPORT_FINISHED");
  }
  if (importView.batch.status === "AWAITING_APPROVAL") {
    const claimed = await dependencies.approveAndClaimTask({
      taskId: importView.batch.id,
      actor: "LORENZO",
    });
    if (!claimed) {
      throw new ShopifyCatalogImportError("L'autorizzazione non e piu disponibile.", "IMPORT_NOT_APPROVED");
    }
    await dependencies
      .writeAudit({
        taskId: claimed.id,
        event: "AUTHORIZED",
        metadata: { maxProducts: AETERNA_PRODUCT_CATALOG.length },
      })
      .catch(() => undefined);
  }
  return load(batchId, dependencies);
}

/**
 * Processes at most one catalog item. This keeps each request short enough for
 * Render Free and leaves the exact next state in PostgreSQL before returning.
 */
export async function processNextAeternaCatalogItem(
  batchId: string,
  dependencies: CatalogImportDependencies = defaultDependencies(),
): Promise<CatalogImportView> {
  if (!dependencies.isDatabaseConfigured()) {
    throw new ShopifyCatalogImportError("Database non configurato.", "DATABASE_NOT_CONFIGURED");
  }
  let importView = await load(batchId, dependencies);
  if (importView.batch.status !== "RUNNING") {
    throw new ShopifyCatalogImportError(
      "Conferma prima l'autorizzazione all'importazione.",
      "IMPORT_NOT_APPROVED",
    );
  }
  const children = await dependencies.listChildren(importView.batch.id);
  const interrupted = children.find((task) => task.status === "RUNNING");
  if (interrupted) {
    const persistedProductId = hasPersistedShopifyProduct(interrupted);
    // A product ID written by the callback proves that the first write happened.
    // Never repeat a mutation after an interrupted write whose full outcome is unknown.
    await dependencies.transitionTask({
      taskId: interrupted.id,
      status: persistedProductId ? "COMPLETED" : "FAILED",
      actor: "ALESSANDRO",
      result:
        persistedProductId
          ? `DRAFT_CREATED:${persistedProductId}; PRICE_UNDEFINED: prezzo da definire. Ripresa sicura dopo interruzione.`
          : "ERROR: elaborazione interrotta prima della conferma di scrittura Shopify. Il prodotto non e stato ritentato automaticamente.",
    });
    return load(batchId, dependencies);
  }
  const next = children.find((task) => task.status === "QUEUED");
  if (!next) {
    if (children.every((task) => task.status !== "RUNNING")) {
      await dependencies
        .transitionTask({
          taskId: importView.batch.id,
          status: "COMPLETED",
          actor: "LORENZO",
          result: "Importazione catalogo conclusa. Verifica il riepilogo dei singoli prodotti.",
        })
        .catch(() => undefined);
    }
    return load(batchId, dependencies);
  }
  const claimed = await dependencies.claimTask({ taskId: next.id, actor: "ALESSANDRO" });
  if (!claimed) return load(batchId, dependencies);
  const item = itemFromTask(claimed);
  if (!item) {
    await dependencies.transitionTask({
      taskId: claimed.id,
      status: "FAILED",
      actor: "ALESSANDRO",
      result: "ERROR: dati catalogo non leggibili. Nessuna richiesta Shopify eseguita.",
    });
    return load(batchId, dependencies);
  }
  try {
    const product = await dependencies.createDraftProduct(catalogItemToDraft(item), async (created) => {
      // Persist before the variant mutation. This makes an interrupted request
      // observable and prevents a blind duplicate write on the next step.
      await dependencies.transitionTask({
        taskId: claimed.id,
        status: "RUNNING",
        actor: "ALESSANDRO",
        result: `SHOPIFY_PRODUCT_ID:${created.productId}; WRITE_IN_PROGRESS`,
      });
    });
    await dependencies.transitionTask({
      taskId: claimed.id,
      status: "COMPLETED",
      actor: "ALESSANDRO",
      result: `DRAFT_CREATED:${product.productId}; PRICE_UNDEFINED: prezzo da definire prima della pubblicazione.`,
    });
    await dependencies.writeAudit({
      taskId: claimed.id,
      event: "STEP_COMPLETED",
      metadata: { sku: item.sku, outcome: "DRAFT_CREATED", priceState: "UNDEFINED", productId: product.productId },
    }).catch(() => undefined);
  } catch (error) {
    const duplicateProductId = error instanceof ShopifyDuplicateProductError || error instanceof ShopifyDuplicateSkuError
      ? error.productId
      : undefined;
    if (duplicateProductId) {
      await dependencies.transitionTask({
        taskId: claimed.id,
        status: "COMPLETED",
        actor: "ALESSANDRO",
        result: `ALREADY_PRESENT:${duplicateProductId}; nessuna modifica Shopify eseguita.`,
      });
      await dependencies.writeAudit({
        taskId: claimed.id,
        event: "STEP_COMPLETED",
        metadata: { sku: item.sku, outcome: "ALREADY_PRESENT", productId: duplicateProductId },
      }).catch(() => undefined);
    } else {
      const persistedProductId = hasPersistedShopifyProduct((await dependencies.getTask(claimed.id)) ?? claimed);
      await dependencies.transitionTask({
        taskId: claimed.id,
        status: "FAILED",
        actor: "ALESSANDRO",
        result: persistedProductId
          ? `ERROR: WRITE_OUTCOME_UNKNOWN:${persistedProductId}; verifica la bozza Shopify prima di qualsiasi nuovo tentativo.`
          : "ERROR: SHOPIFY_REQUEST_FAILED; nessun retry automatico e nessuna pubblicazione eseguita.",
      });
      await dependencies.writeAudit({
        taskId: claimed.id,
        event: "STEP_COMPLETED",
        metadata: { sku: item.sku, outcome: persistedProductId ? "WRITE_OUTCOME_UNKNOWN" : "FAILED" },
      }).catch(() => undefined);
    }
  }
  importView = await load(batchId, dependencies);
  if (importView.totals.queued === 0 && importView.totals.running === 0) {
    await dependencies
      .transitionTask({
        taskId: importView.batch.id,
        status: "COMPLETED",
        actor: "LORENZO",
        result: "Importazione conclusa. Le bozze create restano DRAFT e con prezzo da definire.",
      })
      .catch(() => undefined);
    importView = await load(batchId, dependencies);
  }
  return importView;
}
