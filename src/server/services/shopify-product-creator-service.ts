import { createHash } from "node:crypto";
import { z } from "zod";
import { AuditAction } from "@/generated/prisma/enums";
import {
  ShopifyAdapter,
  ShopifyDuplicateProductError,
  ShopifyWriteAccessError,
} from "@/integrations/shopify/shopify.adapter";
import type { ShopifyDraftProduct, ShopifyDraftProductResult } from "@/integrations/shopify/shopify.types";
import { OpenAiService, type AiInvocationResult } from "@/server/ai/openai-service";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";
import {
  approveAndClaimAgentTask,
  claimQueuedAgentTask,
  createAgentTask,
  transitionAgentTask,
  type AgentTaskView,
} from "@/server/services/agent-task-service";

const MAX_VARIANTS = 24;
const MAX_IMAGES = 8;

const priceSchema = z
  .string()
  .trim()
  .regex(/^\d{1,8}(?:\.\d{1,2})?$/, "Il prezzo deve essere un importo decimale positivo.");

export const productFactsSchema = z
  .object({
    sourceReference: z.string().trim().min(3).max(120),
    productName: z.string().trim().min(2).max(140),
    productType: z.string().trim().min(2).max(80).nullable().optional(),
    factualDescription: z.string().trim().min(20).max(1_400),
    materials: z.array(z.string().trim().min(2).max(80)).min(1).max(12),
    variants: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(100),
          sku: z.string().trim().min(1).max(80).nullable().optional(),
          price: priceSchema,
          optionValues: z
            .array(
              z.object({
                optionName: z.string().trim().min(1).max(40),
                value: z.string().trim().min(1).max(80),
              }),
            )
            .min(1)
            .max(3),
        }),
      )
      .min(1)
      .max(MAX_VARIANTS),
    images: z
      .array(
        z.object({
          sourceUrl: z.string().url().refine((value) => value.startsWith("https://"), "Gli asset devono usare HTTPS."),
          altText: z.string().trim().min(1).max(160).nullable().optional(),
        }),
      )
      .max(MAX_IMAGES)
      .default([]),
  })
  .strict();

const generatedCopySchema = z
  .object({
    title: z.string().trim().min(2).max(140),
    handle: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
    descriptionHtml: z.string().trim().min(20).max(2_000),
    seoTitle: z.string().trim().min(2).max(70),
    seoDescription: z.string().trim().min(2).max(160),
  })
  .strict();

const storedProposalSchema = z
  .object({
    kind: z.literal("SHOPIFY_PRODUCT_PROPOSAL"),
    sourceReference: z.string(),
    product: z.object({
      title: z.string(),
      handle: z.string(),
      descriptionHtml: z.string(),
      seoTitle: z.string(),
      seoDescription: z.string(),
      productType: z.string().nullable(),
      materials: z.array(z.string()),
      variants: z.array(
        z.object({
          title: z.string(),
          sku: z.string().nullable(),
          price: z.string(),
          optionValues: z.array(z.object({ optionName: z.string(), value: z.string() })),
        }),
      ),
      images: z.array(z.object({ sourceUrl: z.string(), altText: z.string().nullable() })),
    }),
  })
  .strict();

export type ProductFacts = z.infer<typeof productFactsSchema>;
export type ShopifyProductProposal = z.infer<typeof storedProposalSchema>;

type AiGenerator = Pick<OpenAiService, "generate">;
type TaskCreator = typeof createAgentTask;
type TaskTransitioner = typeof transitionAgentTask;
type TaskClaimer = typeof claimQueuedAgentTask;
type ApprovalClaimer = typeof approveAndClaimAgentTask;
type ProductCreator = Pick<ShopifyAdapter, "createDraftProduct">;

export type ShopifyProductCreatorDependencies = {
  ai: AiGenerator;
  createTask: TaskCreator;
  transitionTask: TaskTransitioner;
  claimTask: TaskClaimer;
  approveAndClaimTask: ApprovalClaimer;
  getTask: (taskId: string) => Promise<AgentTaskView | null>;
  findProposalTask: (dedupeKey: string) => Promise<AgentTaskView | null>;
  createDraftProduct: ProductCreator["createDraftProduct"];
  writeAudit: (input: { taskId?: string; status: "PROPOSED" | "STARTED" | "COMPLETED" | "FAILED"; metadata?: Record<string, unknown> }) => Promise<void>;
  isDatabaseConfigured: () => boolean;
};

export class ShopifyProductCreatorError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "DATABASE_NOT_CONFIGURED"
      | "PROPOSAL_NOT_FOUND"
      | "PROPOSAL_NOT_READY"
      | "PROPOSAL_INVALID"
      | "AI_OUTPUT_INVALID"
      | "WRITE_SCOPE_MISSING"
      | "DUPLICATE_PRODUCT"
      | "WRITE_OUTCOME_UNKNOWN"
      | "PRODUCT_CREATION_FAILED",
  ) {
    super(message);
    this.name = "ShopifyProductCreatorError";
  }
}

function key(prefix: string, value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 28)}`;
}

function safeParseCopy(text: string): z.infer<typeof generatedCopySchema> {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = generatedCopySchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Normalized below; the raw model output must never be persisted.
  }
  throw new ShopifyProductCreatorError("La proposta AI non ha un formato verificabile.", "AI_OUTPUT_INVALID");
}

function proposalFrom(facts: ProductFacts, copy: z.infer<typeof generatedCopySchema>): ShopifyProductProposal {
  return {
    kind: "SHOPIFY_PRODUCT_PROPOSAL",
    sourceReference: facts.sourceReference,
    product: {
      ...copy,
      productType: facts.productType ?? null,
      materials: facts.materials,
      variants: facts.variants.map((variant) => ({
        ...variant,
        sku: variant.sku ?? null,
      })),
      images: facts.images.map((image) => ({ ...image, altText: image.altText ?? null })),
    },
  };
}

export function buildProductProposalPrompt(facts: ProductFacts): string {
  return [
    "You are Alessandro, AETERNA's E-commerce Specialist.",
    "Prepare English product copy using ONLY the verified facts below.",
    "Do not invent materials, dimensions, provenance, prices, inventory, product claims, or image facts.",
    "Keep the handle lowercase ASCII words separated by hyphens. Return only valid JSON with title, handle, descriptionHtml, seoTitle, seoDescription.",
    "VERIFIED FACTS:",
    JSON.stringify({
      productName: facts.productName,
      productType: facts.productType ?? null,
      factualDescription: facts.factualDescription,
      materials: facts.materials,
      variants: facts.variants.map(({ title, optionValues }) => ({ title, optionValues })),
      imageCount: facts.images.length,
    }),
  ].join("\n");
}

function serializeProposal(proposal: ShopifyProductProposal): string {
  const serialized = JSON.stringify(proposal);
  if (serialized.length > 2_900) {
    throw new ShopifyProductCreatorError("La proposta contiene troppi dati per essere salvata in sicurezza.", "PROPOSAL_INVALID");
  }
  return serialized;
}

export function readStoredProductProposal(description: string | null): ShopifyProductProposal | null {
  if (!description) return null;
  try {
    const parsed = storedProposalSchema.safeParse(JSON.parse(description));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function proposalToDraft(proposal: ShopifyProductProposal): ShopifyDraftProduct {
  return proposal.product;
}

function mapStoredTask(task: {
  id: string; agent: string; title: string; description: string | null; source: "MANUAL" | "AUTOMATIC" | "EVENT";
  priority: number; status: string; requiresApproval: boolean; approvalReason: string | null; result: string | null;
  executionId: string | null; aiInvocationId: string | null; parentTaskId: string | null; createdAt: Date; updatedAt: Date;
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

async function defaultGetTask(taskId: string): Promise<AgentTaskView | null> {
  const task = await getDatabaseClient().agentTask.findUnique({ where: { id: taskId } });
  return task ? mapStoredTask(task) : null;
}

async function defaultFindProposalTask(dedupeKey: string): Promise<AgentTaskView | null> {
  const task = await getDatabaseClient().agentTask.findFirst({ where: { dedupeKey } });
  return task ? mapStoredTask(task) : null;
}

async function defaultWriteAudit(input: {
  taskId?: string;
  status: "PROPOSED" | "STARTED" | "COMPLETED" | "FAILED";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDatabaseClient().auditLog.create({
    data: {
      action: AuditAction.OTHER,
      entityType: "ShopifyProductDraft",
      entityId: input.taskId,
      metadata: { status: input.status, ...(input.metadata ?? {}) },
    },
  });
}

function defaultDependencies(): ShopifyProductCreatorDependencies {
  const adapter = new ShopifyAdapter();
  return {
    ai: new OpenAiService(),
    createTask: createAgentTask,
    transitionTask: transitionAgentTask,
    claimTask: claimQueuedAgentTask,
    approveAndClaimTask: approveAndClaimAgentTask,
    getTask: defaultGetTask,
    findProposalTask: defaultFindProposalTask,
    createDraftProduct: adapter.createDraftProduct.bind(adapter),
    writeAudit: defaultWriteAudit,
    isDatabaseConfigured,
  };
}

export async function createShopifyProductProposal(
  rawFacts: unknown,
  dependencies: ShopifyProductCreatorDependencies = defaultDependencies(),
): Promise<{ created: boolean; supervisionTask: AgentTaskView; proposalTask: AgentTaskView; proposal: ShopifyProductProposal }> {
  const facts = productFactsSchema.parse(rawFacts);
  if (!dependencies.isDatabaseConfigured()) {
    throw new ShopifyProductCreatorError("Database non configurato: non e possibile salvare la proposta.", "DATABASE_NOT_CONFIGURED");
  }
  const proposalKey = key("shopify-product-proposal", JSON.stringify(facts));
  const supervision = await dependencies.createTask({
    agent: "LORENZO",
    title: `Supervisione nuovo prodotto: ${facts.productName}`,
    description: "Supervisione della proposta Shopify richiesta manualmente. Nessuna scrittura Shopify in questa fase.",
    source: "MANUAL",
    priority: 25,
    risk: "ANALYSIS",
    dedupeKey: key("shopify-product-supervision", JSON.stringify(facts)),
  });
  const claimed = supervision.created
    ? await dependencies.claimTask({ taskId: supervision.task.id, actor: "LORENZO" })
    : null;

  if (!supervision.created || !claimed) {
    const proposalTask = (await dependencies.findProposalTask(proposalKey)) ?? supervision.task;
    const proposal = readStoredProductProposal(proposalTask.description);
    if (!proposal) throw new ShopifyProductCreatorError("La proposta esistente non e disponibile.", "PROPOSAL_NOT_READY");
    return { created: false, supervisionTask: supervision.task, proposalTask, proposal };
  }

  try {
    const response: AiInvocationResult = await dependencies.ai.generate({
      taskType: "seo_analysis",
      prompt: buildProductProposalPrompt(facts),
      instructions: "Use English for every returned field. Do not add commercial claims that are absent from the verified facts.",
    });
    const proposal = proposalFrom(facts, safeParseCopy(response.text));
    const proposalTask = await dependencies.createTask({
      agent: "ALESSANDRO",
      title: `Nuovo prodotto Shopify: ${proposal.product.title}`,
      description: serializeProposal(proposal),
      source: "MANUAL",
      priority: 30,
      risk: "PUBLIC_SHOPIFY_CHANGE",
      parentTaskId: claimed.id,
      aiInvocationId: response.invocationId ?? undefined,
      dedupeKey: proposalKey,
    });
    const complete = await dependencies.transitionTask({
      taskId: claimed.id,
      status: "COMPLETED",
      actor: "LORENZO",
      result: "Proposta prodotto preparata da Alessandro e in attesa di approvazione umana.",
    });
    await dependencies.writeAudit({ taskId: proposalTask.task.id, status: "PROPOSED", metadata: { hasImages: proposal.product.images.length > 0 } }).catch(() => undefined);
    return { created: proposalTask.created, supervisionTask: complete, proposalTask: proposalTask.task, proposal };
  } catch (error) {
    await dependencies.transitionTask({
      taskId: claimed.id,
      status: "FAILED",
      actor: "LORENZO",
      result: "Proposta prodotto non completata. Nessuna scrittura Shopify e stata eseguita.",
    }).catch(() => undefined);
    throw error;
  }
}

export async function createApprovedShopifyDraft(
  taskId: string,
  dependencies: ShopifyProductCreatorDependencies = defaultDependencies(),
): Promise<{ task: AgentTaskView; product: ShopifyDraftProductResult }> {
  if (!dependencies.isDatabaseConfigured()) {
    throw new ShopifyProductCreatorError("Database non configurato: impossibile verificare l'approvazione.", "DATABASE_NOT_CONFIGURED");
  }
  const existing = await dependencies.getTask(taskId);
  const proposal = readStoredProductProposal(existing?.description ?? null);
  if (!existing) throw new ShopifyProductCreatorError("Proposta prodotto non trovata.", "PROPOSAL_NOT_FOUND");
  if (!proposal || existing.agent !== "ALESSANDRO") {
    throw new ShopifyProductCreatorError("La proposta prodotto salvata non e valida.", "PROPOSAL_INVALID");
  }
  const claimed = await dependencies.approveAndClaimTask({ taskId, actor: "LORENZO" });
  if (!claimed) throw new ShopifyProductCreatorError("La proposta non e piu in attesa di approvazione.", "PROPOSAL_NOT_READY");
  await dependencies.writeAudit({ taskId, status: "STARTED" }).catch(() => undefined);

  let recordedProductId: string | null = null;
  try {
    const product = await dependencies.createDraftProduct(proposalToDraft(proposal), async (created) => {
      recordedProductId = created.productId;
      await dependencies.transitionTask({
        taskId,
        status: "RUNNING",
        actor: "ALESSANDRO",
        result: `Bozza Shopify creata: ${created.productId}. Completamento varianti in corso; non ritentare automaticamente.`,
      });
    });
    const completed = await dependencies.transitionTask({
      taskId,
      status: "COMPLETED",
      actor: "ALESSANDRO",
      result: `Bozza Shopify creata: ${product.productId}. Handle: ${product.handle}. Varianti create: ${product.variantIds.length}. Stato: DRAFT, non pubblicato.`,
    });
    await dependencies.writeAudit({ taskId, status: "COMPLETED", metadata: { productId: product.productId, variantCount: product.variantIds.length } }).catch(() => undefined);
    return { task: completed, product };
  } catch (error) {
    const code = error instanceof ShopifyWriteAccessError
      ? "WRITE_SCOPE_MISSING"
      : error instanceof ShopifyDuplicateProductError
        ? "DUPLICATE_PRODUCT"
        : recordedProductId
          ? "WRITE_OUTCOME_UNKNOWN"
          : "PRODUCT_CREATION_FAILED";
    const message = code === "WRITE_OUTCOME_UNKNOWN"
      ? `Creazione Shopify da verificare manualmente. Product ID registrato: ${recordedProductId}. Nessun retry automatico.`
      : `Creazione bozza Shopify non completata. Codice: ${code}.`;
    await dependencies.transitionTask({ taskId, status: "FAILED", actor: "ALESSANDRO", result: message }).catch(() => undefined);
    await dependencies.writeAudit({ taskId, status: "FAILED", metadata: { code, productId: recordedProductId } }).catch(() => undefined);
    if (error instanceof ShopifyWriteAccessError) throw new ShopifyProductCreatorError(error.message, "WRITE_SCOPE_MISSING");
    if (error instanceof ShopifyDuplicateProductError) throw new ShopifyProductCreatorError(error.message, "DUPLICATE_PRODUCT");
    if (code === "WRITE_OUTCOME_UNKNOWN") throw new ShopifyProductCreatorError("La bozza potrebbe essere stata creata: verifica l'ID Shopify registrato prima di qualsiasi azione.", code);
    throw new ShopifyProductCreatorError("Shopify non ha creato la bozza prodotto.", code);
  }
}

export async function listShopifyProductProposals(): Promise<AgentTaskView[]> {
  if (!isDatabaseConfigured()) return [];
  const tasks = await getDatabaseClient().agentTask.findMany({
    where: { agent: "ALESSANDRO", dedupeKey: { startsWith: "shopify-product-proposal:" } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return tasks.map(mapStoredTask);
}
