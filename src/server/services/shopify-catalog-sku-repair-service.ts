import { z } from "zod";
import { AuditAction } from "@/generated/prisma/enums";
import { ShopifyAdapter } from "@/integrations/shopify/shopify.adapter";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";
import {
  approveAndClaimAgentTask,
  claimQueuedAgentTask,
  createAgentTask,
  retryFailedAgentTask,
  transitionAgentTask,
  type AgentTaskView,
} from "@/server/services/agent-task-service";
import { getAeternaCatalogImport } from "@/server/services/shopify-catalog-import-service";

const key = "aeterna-catalog-sku-repair:v1";
const idSchema = z.string().cuid();
const repairItemSchema = z.object({ originalTaskId: z.string().cuid(), productId: z.string().min(1), name: z.string().min(1), handle: z.string().min(1), sku: z.string().min(1) });

export type SkuRepairView = {
  batch: AgentTaskView;
  items: Array<{ taskId: string; originalTaskId: string; name: string; sku: string; productId: string; status: "PENDING_REVIEW" | "READY" | "REPAIRED" | "BLOCKED" | "FAILED"; message: string | null }>;
  totals: { total: number; ready: number; repaired: number; blocked: number; failed: number };
};

function mapTask(task: { id: string; agent: string; title: string; description: string | null; source: "MANUAL" | "AUTOMATIC" | "EVENT"; priority: number; status: string; requiresApproval: boolean; approvalReason: string | null; result: string | null; executionId: string | null; aiInvocationId: string | null; parentTaskId: string | null; createdAt: Date; updatedAt: Date }): AgentTaskView {
  return { ...task, agent: task.agent as AgentTaskView["agent"], status: task.status as AgentTaskView["status"], createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() };
}
async function getTask(id: string) { const t = await getDatabaseClient().agentTask.findUnique({ where: { id } }); return t ? mapTask(t) : null; }
async function listChildren(id: string) { return (await getDatabaseClient().agentTask.findMany({ where: { parentTaskId: id }, orderBy: { priority: "asc" } })).map(mapTask); }
async function audit(input: { taskId: string; event: string; metadata?: Record<string, unknown> }) {
  if (!isDatabaseConfigured()) return;
  await getDatabaseClient().auditLog.create({ data: { action: AuditAction.OTHER, entityType: "ShopifyCatalogSkuRepair", entityId: input.taskId, metadata: { event: input.event, ...(input.metadata ?? {}) } } });
}
function deps() {
  const adapter = new ShopifyAdapter();
  return { getTask, listChildren, createTask: createAgentTask, transition: transitionAgentTask, claim: claimQueuedAgentTask, approve: approveAndClaimAgentTask, retry: retryFailedAgentTask, audit, adapter, configured: isDatabaseConfigured };
}
type Deps = ReturnType<typeof deps>;
function parse(task: AgentTaskView) { try { const p = repairItemSchema.safeParse(JSON.parse(task.description ?? "")); return p.success ? p.data : null; } catch { return null; } }
function state(task: AgentTaskView): SkuRepairView["items"][number]["status"] { if (task.result?.startsWith("REPAIR_APPLIED:")) return "REPAIRED"; if (task.result?.startsWith("REPAIR_READY:")) return "READY"; if (task.result?.startsWith("REPAIR_BLOCKED:")) return "BLOCKED"; if (task.status === "FAILED") return "FAILED"; return "PENDING_REVIEW"; }
function view(batch: AgentTaskView, children: AgentTaskView[]): SkuRepairView {
  const items = children.flatMap((task) => { const item = parse(task); return item ? [{ taskId: task.id, originalTaskId: item.originalTaskId, name: item.name, sku: item.sku, productId: item.productId, status: state(task), message: task.result }] : []; });
  const totals = { total: items.length, ready: 0, repaired: 0, blocked: 0, failed: 0 };
  for (const item of items) { if (item.status === "READY") totals.ready++; else if (item.status === "REPAIRED") totals.repaired++; else if (item.status === "BLOCKED") totals.blocked++; else if (item.status === "FAILED") totals.failed++; }
  return { batch, items, totals };
}
async function load(repairId: string, d: Deps) { const b = await d.getTask(idSchema.parse(repairId)); if (!b || b.title !== "Riparazione SKU bozze AETERNA") throw new Error("SKU_REPAIR_NOT_FOUND"); return view(b, await d.listChildren(b.id)); }
function productId(message: string | null) { return message?.match(/^ERROR: RECONCILIATION_SKU_MISSING:([^;\s]+)/)?.[1] ?? null; }
function handle(name: string) { return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

export async function prepareSkuRepair(importId: string, d: Deps = deps()): Promise<SkuRepairView> {
  if (!d.configured()) throw new Error("DATABASE_NOT_CONFIGURED");
  const source = await getAeternaCatalogImport(importId);
  const parent = await d.createTask({ agent: "LORENZO", title: "Riparazione SKU bozze AETERNA", description: "Aggiorna esclusivamente SKU di varianti esistenti dopo approvazione esplicita.", source: "MANUAL", priority: 8, risk: "PUBLIC_SHOPIFY_CHANGE", dedupeKey: key });
  if (parent.created) {
    for (const item of source.items) {
      const id = productId(item.message);
      if (!id) continue;
      await d.createTask({ agent: "ALESSANDRO", title: `Verifica SKU: ${item.name}`, description: JSON.stringify({ originalTaskId: item.taskId, productId: id, name: item.name, handle: handle(item.name), sku: item.sku }), source: "MANUAL", priority: 20, risk: "ANALYSIS", parentTaskId: parent.task.id, dedupeKey: `${key}:${item.sku}` });
    }
  }
  return view(parent.task, await d.listChildren(parent.task.id));
}

/** Read-only preflight, one persisted repair item per request. */
export async function analyzeNextSkuRepair(repairId: string, d: Deps = deps()): Promise<SkuRepairView> {
  const current = await load(repairId, d); const next = (await d.listChildren(current.batch.id)).find((t) => t.status === "QUEUED"); if (!next) return current;
  const claimed = await d.claim({ taskId: next.id, actor: "ALESSANDRO" }); if (!claimed) return load(repairId, d);
  const item = parse(claimed); if (!item) { await d.transition({ taskId: claimed.id, status: "FAILED", actor: "ALESSANDRO", result: "REPAIR_BLOCKED: dati riparazione non validi." }); return load(repairId, d); }
  try {
    const remote = await d.adapter.verifyDraftProduct(item.productId);
    const reason = !remote ? "prodotto non trovato" : remote.status !== "DRAFT" ? "prodotto non in bozza" : remote.title !== item.name || remote.handle !== item.handle ? "identita prodotto non corrispondente" : remote.variants.length !== 1 ? "piu varianti presenti" : remote.variants[0]?.sku ? "SKU gia presente o differente" : null;
    if (reason) await d.transition({ taskId: claimed.id, status: "FAILED", actor: "ALESSANDRO", result: `REPAIR_BLOCKED: ${reason}. Revisione manuale richiesta.` });
    else await d.transition({ taskId: claimed.id, status: "AWAITING_APPROVAL", actor: "ALESSANDRO", result: `REPAIR_READY: assegna SKU ${item.sku} alla variante esistente.` });
  } catch { await d.transition({ taskId: claimed.id, status: "FAILED", actor: "ALESSANDRO", result: "REPAIR_BLOCKED: lettura Shopify non riuscita. Nessuna modifica eseguita." }); }
  return load(repairId, d);
}

export async function authorizeSkuRepair(repairId: string, d: Deps = deps()): Promise<SkuRepairView> {
  const current = await load(repairId, d); const parent = await d.approve({ taskId: current.batch.id, actor: "LORENZO" }); if (!parent && current.batch.status !== "RUNNING") throw new Error("REPAIR_APPROVAL_REQUIRED");
  for (const item of await d.listChildren(current.batch.id)) if (item.status === "AWAITING_APPROVAL" && item.result?.startsWith("REPAIR_READY:")) await d.transition({ taskId: item.id, status: "QUEUED", actor: "LORENZO" });
  await d.audit({ taskId: current.batch.id, event: "APPROVED", metadata: { scope: "SKU_ONLY" } }).catch(() => undefined); return load(repairId, d);
}

export async function repairNextSku(repairId: string, d: Deps = deps()): Promise<SkuRepairView> {
  const current = await load(repairId, d); if (current.batch.status !== "RUNNING") throw new Error("REPAIR_APPROVAL_REQUIRED"); const next = (await d.listChildren(current.batch.id)).find((t) => t.status === "QUEUED"); if (!next) return current;
  const claimed = await d.claim({ taskId: next.id, actor: "ALESSANDRO" }); if (!claimed) return load(repairId, d); const item = parse(claimed); if (!item) return load(repairId, d);
  try {
    const remote = await d.adapter.verifyDraftProduct(item.productId); const variant = remote?.variants.length === 1 ? remote.variants[0] : null;
    if (!remote || remote.status !== "DRAFT" || remote.title !== item.name || remote.handle !== item.handle || !variant || variant.sku) throw new Error("REPAIR_PRECONDITION_FAILED");
    const owner = await d.adapter.findProductIdBySku(item.sku); if (owner && owner !== item.productId) throw new Error("REPAIR_SKU_ALREADY_USED");
    await d.transition({ taskId: claimed.id, status: "RUNNING", actor: "ALESSANDRO", result: `REPAIR_WRITE_IN_PROGRESS:${item.productId}; variant=${variant.id}` });
    await d.adapter.updateExistingVariantSku({ productId: item.productId, variantId: variant.id, sku: item.sku });
    const verified = await d.adapter.verifyDraftProduct(item.productId); if (!verified || verified.status !== "DRAFT" || !verified.variants.some((v) => v.id === variant.id && v.sku === item.sku)) throw new Error("REPAIR_VERIFY_FAILED");
    const original = await d.retry({ taskId: item.originalTaskId, actor: "ALESSANDRO" }); if (!original) throw new Error("REPAIR_ORIGINAL_TASK_LOCKED"); const claimedOriginal = await d.claim({ taskId: original.id, actor: "ALESSANDRO" }); if (!claimedOriginal) throw new Error("REPAIR_ORIGINAL_TASK_LOCKED");
    await d.transition({ taskId: claimedOriginal.id, status: "COMPLETED", actor: "ALESSANDRO", result: `DRAFT_CREATED:${item.productId}; PRICE_UNDEFINED: SKU ${item.sku} verificato dopo riparazione.` });
    await d.transition({ taskId: claimed.id, status: "COMPLETED", actor: "ALESSANDRO", result: `REPAIR_APPLIED:${item.productId}; SKU ${item.sku} verificato.` });
    await d.audit({ taskId: claimed.id, event: "APPLIED", metadata: { productId: item.productId, variantId: variant.id, previousSku: null, nextSku: item.sku, approved: true } }).catch(() => undefined);
  } catch (error) {
    const code = error instanceof Error ? error.message : "REPAIR_WRITE_OUTCOME_UNKNOWN";
    // A mutation can time out after Shopify accepted it. Read before classifying
    // the outcome; this path never repeats the write.
    const after = await d.adapter.verifyDraftProduct(item.productId).catch(() => null);
    const repaired = after?.status === "DRAFT" && after.variants.some((variant) => variant.sku === item.sku);
    if (repaired) {
      const original = await d.retry({ taskId: item.originalTaskId, actor: "ALESSANDRO" });
      const claimedOriginal = original ? await d.claim({ taskId: original.id, actor: "ALESSANDRO" }) : null;
      if (claimedOriginal) await d.transition({ taskId: claimedOriginal.id, status: "COMPLETED", actor: "ALESSANDRO", result: `DRAFT_CREATED:${item.productId}; PRICE_UNDEFINED: SKU ${item.sku} verificato dopo esito incerto.` });
      await d.transition({ taskId: claimed.id, status: "COMPLETED", actor: "ALESSANDRO", result: `REPAIR_APPLIED:${item.productId}; SKU ${item.sku} confermato dopo esito incerto.` });
      await d.audit({ taskId: claimed.id, event: "APPLIED_AFTER_UNCERTAIN_OUTCOME", metadata: { productId: item.productId, nextSku: item.sku } }).catch(() => undefined);
    } else {
      await d.transition({ taskId: claimed.id, status: "FAILED", actor: "ALESSANDRO", result: `REPAIR_BLOCKED: ${code}. Esito incerto: rilettura Shopify non conferma lo SKU; nessun retry automatico.` });
    }
  }
  return load(repairId, d);
}
