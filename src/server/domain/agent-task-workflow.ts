import { z } from "zod";
import { DomainError } from "@/server/domain/errors";

export const agentIdSchema = z.enum(["LORENZO", "MARCO", "GIULIA", "ALESSANDRO", "MATTEO", "FRANCESCA"]);
export const agentTaskSourceSchema = z.enum(["MANUAL", "AUTOMATIC", "EVENT"]);
export const agentTaskStatusSchema = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED", "AWAITING_APPROVAL", "CANCELLED"]);
export const agentTaskRiskSchema = z.enum(["ANALYSIS", "DATA_COLLECTION", "CONFIGURATION", "PUBLIC_SHOPIFY_CHANGE", "META_CAMPAIGN_CHANGE", "AD_SPEND", "CUSTOMER_COMMUNICATION", "CONTENT_PUBLICATION"]);

export type AgentId = z.infer<typeof agentIdSchema>;
export type AgentTaskStatus = z.infer<typeof agentTaskStatusSchema>;
export type AgentTaskRisk = z.infer<typeof agentTaskRiskSchema>;

export const AGENT_PROFILES = [
  { id: "LORENZO", name: "Lorenzo", role: "CEO", scope: "Strategia e coordinamento." },
  { id: "MARCO", name: "Marco", role: "Marketing", scope: "Campagne pubblicitarie e acquisizione clienti." },
  { id: "GIULIA", name: "Giulia", role: "Creative", scope: "Contenuti, immagini e video." },
  { id: "ALESSANDRO", name: "Alessandro", role: "E-commerce & SEO", scope: "Shopify e posizionamento Google." },
  { id: "MATTEO", name: "Matteo", role: "Ordini & Supporto", scope: "Ordini e assistenza clienti." },
  { id: "FRANCESCA", name: "Francesca", role: "Finanza", scope: "Costi, margini e performance economiche." },
] as const;

export const createAgentTaskSchema = z.object({
  agent: agentIdSchema,
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(3_000).optional(),
  source: agentTaskSourceSchema.default("MANUAL"),
  priority: z.number().int().min(0).max(100).default(50),
  risk: agentTaskRiskSchema.default("ANALYSIS"),
  dedupeKey: z.string().trim().min(1).max(160).optional(),
  parentTaskId: z.string().trim().min(1).optional(),
  executionId: z.string().trim().min(1).max(128).optional(),
  aiInvocationId: z.string().trim().min(1).optional(),
});

export const approvalRequiredRisks = new Set<AgentTaskRisk>(["PUBLIC_SHOPIFY_CHANGE", "META_CAMPAIGN_CHANGE", "AD_SPEND", "CUSTOMER_COMMUNICATION", "CONTENT_PUBLICATION"]);

export function requiresApproval(risk: AgentTaskRisk): boolean { return approvalRequiredRisks.has(risk); }

const transitions: Record<AgentTaskStatus, AgentTaskStatus[]> = {
  QUEUED: ["RUNNING", "AWAITING_APPROVAL", "CANCELLED"],
  RUNNING: ["COMPLETED", "FAILED", "AWAITING_APPROVAL", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["QUEUED", "CANCELLED"],
  AWAITING_APPROVAL: ["QUEUED", "CANCELLED"],
  CANCELLED: [],
};

export function assertAgentTaskTransition(from: AgentTaskStatus, to: AgentTaskStatus): void {
  if (from === to || transitions[from].includes(to)) return;
  throw new DomainError(`Transizione non consentita: ${from} → ${to}.`, "AGENT_TASK_INVALID_TRANSITION");
}

export function initialAgentTaskStatus(risk: AgentTaskRisk): AgentTaskStatus {
  return requiresApproval(risk) ? "AWAITING_APPROVAL" : "QUEUED";
}

/** Mirrors the unique persistence key so callers can safely avoid duplicate proposals before writing. */
export function hasDuplicateDedupeKey(existingKeys: Iterable<string | null>, dedupeKey: string | undefined): boolean {
  return Boolean(dedupeKey && Array.from(existingKeys).some((key) => key === dedupeKey));
}
