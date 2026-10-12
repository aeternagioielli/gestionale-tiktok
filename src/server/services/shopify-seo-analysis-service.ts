import { createHash } from "node:crypto";
import { z } from "zod";
import { AuditAction } from "@/generated/prisma/enums";
import { ShopifyAdapter } from "@/integrations/shopify/shopify.adapter";
import type { ShopifyCatalogProduct } from "@/integrations/shopify/shopify.types";
import { OpenAiService, type AiInvocationResult } from "@/server/ai/openai-service";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";
import {
  claimQueuedAgentTask,
  createAgentTask,
  retryFailedAgentTask,
  transitionAgentTask,
  type AgentTaskView,
} from "@/server/services/agent-task-service";

const DEFAULT_MAX_PRODUCTS = 12;
const HARD_MAX_PRODUCTS = 25;
const MAX_PROMPT_CHARACTERS = 18_000;

const seoProposalSchema = z.object({
  productExternalId: z.string().trim().min(1).max(256),
  seoTitle: z.string().trim().min(1).max(70),
  seoDescription: z.string().trim().min(1).max(160),
  rationale: z.string().trim().min(1).max(600),
});

const generatedAnalysisSchema = z.object({
  catalogSummary: z.string().trim().min(1).max(1_200),
  limitations: z.string().trim().min(1).max(1_200),
  proposals: z.array(seoProposalSchema).min(1).max(HARD_MAX_PRODUCTS),
});

type GeneratedAnalysis = z.infer<typeof generatedAnalysisSchema>;

type AiGenerator = Pick<OpenAiService, "generate">;
type TaskCreator = typeof createAgentTask;
type TaskTransitioner = typeof transitionAgentTask;
type TaskRetry = typeof retryFailedAgentTask;
type TaskClaimer = typeof claimQueuedAgentTask;

export type ShopifySeoAnalysisDependencies = {
  fetchCatalog: () => Promise<ShopifyCatalogProduct[]>;
  ai: AiGenerator;
  createTask: TaskCreator;
  transitionTask: TaskTransitioner;
  retryFailedTask: TaskRetry;
  claimTask: TaskClaimer;
  writeAudit: (input: { entityId?: string; status: "STARTED" | "COMPLETED" | "FAILED"; metadata?: Record<string, unknown> }) => Promise<void>;
  isDatabaseConfigured: () => boolean;
};

export type ShopifySeoAnalysisResult = {
  created: boolean;
  retried: boolean;
  analysisTask: AgentTaskView;
  proposalTasks: AgentTaskView[];
  catalog: { totalProducts: number; activeProducts: number; analyzedProducts: number };
};

export class ShopifySeoAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "DATABASE_NOT_CONFIGURED"
      | "CATALOG_NO_ACTIVE_PRODUCTS"
      | "CATALOG_INPUT_TOO_LARGE"
      | "AI_OUTPUT_INVALID"
      | "ANALYSIS_FAILED",
  ) {
    super(message);
    this.name = "ShopifySeoAnalysisError";
  }
}

function integerInRange(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, HARD_MAX_PRODUCTS)
    : fallback;
}

export function getShopifySeoAnalysisConfig(env: Record<string, string | undefined> = process.env) {
  return { maxProducts: integerInRange(env.SHOPIFY_SEO_MAX_PRODUCTS, DEFAULT_MAX_PRODUCTS) };
}

function analysisKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function taskKey(prefix: string, value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function stripHtml(value: string | null, limit: number): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function productForPrompt(product: ShopifyCatalogProduct) {
  return {
    productExternalId: product.externalId,
    title: product.title,
    handle: product.handle,
    description: stripHtml(product.descriptionHtml, 700),
    currentSeoTitle: product.seoTitle,
    currentSeoDescription: product.seoDescription,
    hasImage: Boolean(product.imageUrl),
    imageAltText: product.imageAltText,
    imageCount: product.images.length,
    productType: product.productType,
    variants: product.variants.slice(0, 10).map((variant) => ({
      title: variant.title,
      sku: variant.sku,
      availableQty: variant.availableQty,
    })),
    availableQty: product.availableQty,
    updatedAt: product.updatedAt?.toISOString() ?? null,
  };
}

function selectProductsForPrompt(products: ShopifyCatalogProduct[], maxProducts: number) {
  const selected: ReturnType<typeof productForPrompt>[] = [];
  for (const product of products) {
    if (selected.length >= maxProducts) break;
    const candidate = productForPrompt(product);
    if (JSON.stringify([...selected, candidate]).length > MAX_PROMPT_CHARACTERS) break;
    selected.push(candidate);
  }
  return selected;
}

export function buildShopifySeoPrompt(input: {
  totalProducts: number;
  activeProducts: number;
  products: ReturnType<typeof productForPrompt>[];
}): string {
  return [
    "Sei Alessandro, E-commerce & SEO Specialist di AETERNA.",
    "Analizza esclusivamente il catalogo Shopify fornito. Non inventare attributi, keyword, risultati, traffico, conversioni o vendite.",
    "Scrivi catalogSummary e limitations in italiano. Scrivi seoTitle, seoDescription e rationale in inglese.",
    "Proponi solo ottimizzazioni SEO: non modificare Shopify, prezzi, inventario, pubblicazioni o campagne.",
    "Ogni proposta deve riferirsi a un productExternalId presente nel catalogo. Mantieni title entro 70 caratteri e description entro 160 caratteri.",
    "Rispondi esclusivamente con JSON valido nel formato seguente:",
    JSON.stringify({
      catalogSummary: "string",
      limitations: "string",
      proposals: [{ productExternalId: "string", seoTitle: "string", seoDescription: "string", rationale: "string" }],
    }),
    "CATALOGO REALE:",
    JSON.stringify(input),
  ].join("\n");
}

function parseGeneratedAnalysis(text: string, allowedProductIds: Set<string>): GeneratedAnalysis {
  const withoutFence = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(withoutFence);
  } catch {
    throw new ShopifySeoAnalysisError("L'analisi SEO ricevuta non ha un formato utilizzabile.", "AI_OUTPUT_INVALID");
  }
  const parsed = generatedAnalysisSchema.safeParse(value);
  if (!parsed.success) throw new ShopifySeoAnalysisError("L'analisi SEO ricevuta non ha un formato utilizzabile.", "AI_OUTPUT_INVALID");
  const uniqueIds = new Set<string>();
  for (const proposal of parsed.data.proposals) {
    if (!allowedProductIds.has(proposal.productExternalId) || uniqueIds.has(proposal.productExternalId)) {
      throw new ShopifySeoAnalysisError("L'analisi SEO contiene proposte non verificabili rispetto al catalogo.", "AI_OUTPUT_INVALID");
    }
    uniqueIds.add(proposal.productExternalId);
  }
  return parsed.data;
}

function taskDescription(proposal: z.infer<typeof seoProposalSchema>): string {
  return [
    `Proposed SEO title: ${proposal.seoTitle}`,
    `Proposed meta description: ${proposal.seoDescription}`,
    `Rationale: ${proposal.rationale}`,
    "Nessuna modifica Shopify e stata applicata. Richiede approvazione esplicita prima di qualsiasi aggiornamento pubblico.",
  ].join("\n");
}

function analysisResult(analysis: GeneratedAnalysis, catalog: ShopifySeoAnalysisResult["catalog"]): string {
  const result = [
    `Catalogo verificato: ${catalog.totalProducts} prodotti totali, ${catalog.activeProducts} attivi, ${catalog.analyzedProducts} analizzati.`,
    `Sintesi: ${analysis.catalogSummary}`,
    `Limiti: ${analysis.limitations}`,
    `Proposte SEO in attesa di approvazione: ${analysis.proposals.length}.`,
  ].join("\n");
  return result.slice(0, 3_900);
}

async function defaultWriteAudit(input: {
  entityId?: string;
  status: "STARTED" | "COMPLETED" | "FAILED";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDatabaseClient().auditLog.create({
    data: {
      action: AuditAction.OTHER,
      entityType: "ShopifySeoAnalysis",
      entityId: input.entityId,
      metadata: { status: input.status, ...(input.metadata ?? {}) },
    },
  });
}

function defaultDependencies(): ShopifySeoAnalysisDependencies {
  return {
    fetchCatalog: () => new ShopifyAdapter().fetchCatalog(),
    ai: new OpenAiService(),
    createTask: createAgentTask,
    transitionTask: transitionAgentTask,
    retryFailedTask: retryFailedAgentTask,
    claimTask: claimQueuedAgentTask,
    writeAudit: defaultWriteAudit,
    isDatabaseConfigured,
  };
}

/**
 * Creates a single, manually-requested and idempotent SEO analysis. Shopify is read only;
 * every remotely consequential SEO proposal remains awaiting approval.
 */
export async function runShopifySeoAnalysis(
  input: { now?: Date; maxProducts?: number; retryFailed?: boolean } = {},
  dependencies: ShopifySeoAnalysisDependencies = defaultDependencies(),
): Promise<ShopifySeoAnalysisResult> {
  if (!dependencies.isDatabaseConfigured()) {
    throw new ShopifySeoAnalysisError("Database non configurato: non e possibile salvare l'analisi.", "DATABASE_NOT_CONFIGURED");
  }
  const now = input.now ?? new Date();
  const maxProducts = Math.min(Math.max(input.maxProducts ?? getShopifySeoAnalysisConfig().maxProducts, 1), HARD_MAX_PRODUCTS);
  const key = analysisKey(now);
  const parent = await dependencies.createTask({
    agent: "LORENZO",
    title: `Analisi SEO Shopify ${key}`,
    description: "Supervisione dell'analisi SEO del catalogo Shopify richiesta manualmente. Nessuna modifica esterna.",
    source: "MANUAL",
    priority: 20,
    risk: "ANALYSIS",
    dedupeKey: `shopify-seo-analysis:${key}`,
  });
  let analysisTask = parent.task;
  let retried = false;
  if (!parent.created) {
    if (parent.task.status === "FAILED" && input.retryFailed) {
      const reopened = await dependencies.retryFailedTask({ taskId: parent.task.id, actor: "LORENZO" });
      if (reopened) {
        analysisTask = reopened;
        retried = true;
      } else {
        return {
          created: false,
          retried: false,
          analysisTask: parent.task,
          proposalTasks: [],
          catalog: { totalProducts: 0, activeProducts: 0, analyzedProducts: 0 },
        };
      }
    } else {
      return {
        created: false,
          retried: false,
          analysisTask: parent.task,
          proposalTasks: [],
        catalog: { totalProducts: 0, activeProducts: 0, analyzedProducts: 0 },
      };
    }
  }
  const claimed = await dependencies.claimTask({ taskId: analysisTask.id, actor: "LORENZO" });
  if (!claimed) {
    return {
      created: false,
      retried: false,
      analysisTask,
      proposalTasks: [],
      catalog: { totalProducts: 0, activeProducts: 0, analyzedProducts: 0 },
    };
  }
  analysisTask = claimed;
  await dependencies.writeAudit({ entityId: analysisTask.id, status: "STARTED", metadata: { maxProducts, retried } }).catch(() => undefined);

  let diagnostics: Record<string, number> = {};
  try {
    const catalog = await dependencies.fetchCatalog();
    const activeProducts = catalog.filter((product) => product.status === "ACTIVE");
    diagnostics = { totalProducts: catalog.length, activeProducts: activeProducts.length };
    if (activeProducts.length === 0) {
      throw new ShopifySeoAnalysisError("Il catalogo Shopify non contiene prodotti attivi analizzabili.", "CATALOG_NO_ACTIVE_PRODUCTS");
    }
    const selected = selectProductsForPrompt(activeProducts, maxProducts);
    if (selected.length === 0) {
      throw new ShopifySeoAnalysisError("I dati del catalogo selezionati superano il limite sicuro per l'analisi.", "CATALOG_INPUT_TOO_LARGE");
    }
    const catalogSummary = {
      totalProducts: catalog.length,
      activeProducts: activeProducts.length,
      analyzedProducts: selected.length,
    };
    const response: AiInvocationResult = await dependencies.ai.generate({
      taskType: "seo_analysis",
      prompt: buildShopifySeoPrompt({ ...catalogSummary, products: selected }),
      instructions:
        "Restituisci un numero limitato di proposte concrete solo per i prodotti ricevuti. Se dati SEO o immagini mancano, dichiaralo nei limiti invece di inventare dettagli.",
    });
    const analysis = parseGeneratedAnalysis(response.text, new Set(selected.map((product) => product.productExternalId)));
    const proposals = await Promise.all(
      analysis.proposals.map((proposal) =>
        dependencies.createTask({
          agent: "ALESSANDRO",
          title: `Proposta SEO: ${proposal.seoTitle}`,
          description: taskDescription(proposal),
          source: "MANUAL",
          priority: 30,
          risk: "PUBLIC_SHOPIFY_CHANGE",
          parentTaskId: analysisTask.id,
          aiInvocationId: response.invocationId ?? undefined,
          dedupeKey: taskKey(`shopify-seo-proposal:${key}`, proposal.productExternalId),
        }),
      ),
    );
    const completed = await dependencies.transitionTask({
      taskId: analysisTask.id,
      status: "COMPLETED",
      actor: "LORENZO",
      result: analysisResult(analysis, catalogSummary),
    });
    await dependencies.writeAudit({
      entityId: completed.id,
      status: "COMPLETED",
      metadata: { ...catalogSummary, proposals: proposals.length, model: response.model, totalTokens: response.usage.totalTokens },
    }).catch(() => undefined);
    return { created: parent.created, retried, analysisTask: completed, proposalTasks: proposals.map((proposal) => proposal.task), catalog: catalogSummary };
  } catch (error) {
    const safeError = error instanceof ShopifySeoAnalysisError
      ? error
      : new ShopifySeoAnalysisError("L'analisi SEO Shopify non e stata completata.", "ANALYSIS_FAILED");
    await dependencies.transitionTask({
      taskId: analysisTask.id,
      status: "FAILED",
      actor: "LORENZO",
      result: `Analisi SEO non completata. Codice: ${safeError.code}.`,
    }).catch(() => undefined);
    await dependencies.writeAudit({ entityId: analysisTask.id, status: "FAILED", metadata: { code: safeError.code, ...diagnostics } }).catch(() => undefined);
    throw safeError;
  }
}
