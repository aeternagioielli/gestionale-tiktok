import { getOpenAiConfig } from "@/server/ai/config";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";
import { AGENT_PROFILES, type AgentId, type AgentTaskStatus } from "@/server/domain/agent-task-workflow";

export type TeamAiAgentId = "lorenzo" | "marco" | "giulia" | "alessandro" | "matteo" | "francesca";
const cardIds: Record<AgentId, TeamAiAgentId> = { LORENZO: "lorenzo", MARCO: "marco", GIULIA: "giulia", ALESSANDRO: "alessandro", MATTEO: "matteo", FRANCESCA: "francesca" };
export const TEAM_AI_AGENTS = AGENT_PROFILES.map((agent) => ({ ...agent, id: cardIds[agent.id] }));
export type TeamAiAgentStatus = "AVAILABLE" | "QUEUED" | "RUNNING" | "AWAITING_APPROVAL" | "ERROR" | "NOT_CONFIGURED";
export type TeamAiAgentCard = (typeof TEAM_AI_AGENTS)[number] & { status: TeamAiAgentStatus; statusReason: string; currentActivity: string | null; assignedTask: { id: string; title: string; status: AgentTaskStatus; updatedAt: string } | null; configuredModel: string | null; actualModel: null; inputTokens: null; outputTokens: null; totalTokens: null; estimatedCostUsd: null; lastExecutionAt: null };
export type UnattributedUsage = { inputTokens: number; outputTokens: number; totalTokens: number; invocationCount: number; trackingStartedAt: string | null; latestInvocation: { model: string; taskType: string; status: string; createdAt: string } | null; costStatus: "NOT_CONFIGURED" };
export type TeamAiDashboardData = { databaseConfigured: boolean; databaseAvailable: boolean; agents: TeamAiAgentCard[]; configuredAgents: number; runningAgents: number; totalRecordedTokens: number; usageScope: "FROM_AUDIT_ACTIVATION"; unattributedUsage: UnattributedUsage; recentActivities: { id: string; model: string; taskType: string; status: string; createdAt: string }[]; recentOperationalTasks: { id: string; agent: AgentId; title: string; status: AgentTaskStatus; source: string; requiresApproval: boolean; updatedAt: string }[] };

function emptyUsage(): UnattributedUsage { return { inputTokens: 0, outputTokens: 0, totalTokens: 0, invocationCount: 0, trackingStartedAt: null, latestInvocation: null, costStatus: "NOT_CONFIGURED" }; }
type AssignedTask = { id: string; agent: AgentId; title: string; status: AgentTaskStatus; updatedAt: Date };
export function buildTeamAiAgentCards(input: { openAiConfigured: boolean; databaseAvailable: boolean; complexModel: string; assignedTasks?: AssignedTask[] }): TeamAiAgentCard[] {
  return TEAM_AI_AGENTS.map((agent) => {
    const assigned = input.assignedTasks?.find((task) => cardIds[task.agent] === agent.id) ?? null;
    const lorenzoAvailable = agent.id === "lorenzo" && input.openAiConfigured && input.databaseAvailable;
    const status: TeamAiAgentStatus = assigned?.status === "RUNNING" ? "RUNNING" : assigned?.status === "AWAITING_APPROVAL" ? "AWAITING_APPROVAL" : assigned?.status === "QUEUED" ? "QUEUED" : lorenzoAvailable ? "AVAILABLE" : "NOT_CONFIGURED";
    return { ...agent, status, statusReason: assigned ? (assigned.status === "AWAITING_APPROVAL" ? "Attivita bloccata in attesa dell'approvazione richiesta." : assigned.status === "QUEUED" ? "Attivita registrata; nessuna esecuzione automatica e attiva." : "Stato registrato nel registro operativo.") : lorenzoAvailable ? "Report CEO disponibile su richiesta; nessuna esecuzione autonoma e attiva." : agent.id === "lorenzo" ? "Richiede OpenAI e il database per generare e salvare i report CEO." : "Interfaccia predisposta: la funzione operativa non e ancora implementata.", currentActivity: assigned?.status === "RUNNING" ? assigned.title : null, assignedTask: assigned ? { id: assigned.id, title: assigned.title, status: assigned.status, updatedAt: assigned.updatedAt.toISOString() } : null, configuredModel: agent.id === "lorenzo" ? input.complexModel : null, actualModel: null, inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null, lastExecutionAt: null };
  });
}
function emptyDashboard(): TeamAiDashboardData { const config = getOpenAiConfig(); const agents = buildTeamAiAgentCards({ openAiConfigured: Boolean(config.apiKey), databaseAvailable: false, complexModel: config.complexModel }); return { databaseConfigured: false, databaseAvailable: false, agents, configuredAgents: 0, runningAgents: 0, totalRecordedTokens: 0, usageScope: "FROM_AUDIT_ACTIVATION", unattributedUsage: emptyUsage(), recentActivities: [], recentOperationalTasks: [] }; }

export async function getTeamAiDashboardData(): Promise<TeamAiDashboardData> {
  if (!isDatabaseConfigured()) return emptyDashboard();
  const config = getOpenAiConfig();
  try {
    const db = getDatabaseClient();
    const [usage, firstInvocation, latestInvocation, recentActivities] = await Promise.all([
      db.aiInvocation.aggregate({ _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, totalTokens: true } }),
      db.aiInvocation.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      db.aiInvocation.findFirst({ orderBy: { createdAt: "desc" }, select: { model: true, taskType: true, status: true, createdAt: true } }),
      db.aiInvocation.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, model: true, taskType: true, status: true, createdAt: true } }),
    ]);
    let operationalTasks: { id: string; agent: AgentId; title: string; status: AgentTaskStatus; source: string; requiresApproval: boolean; updatedAt: Date }[] = [];
    try { operationalTasks = await db.agentTask.findMany({ orderBy: { updatedAt: "desc" }, take: 24, select: { id: true, agent: true, title: true, status: true, source: true, requiresApproval: true, updatedAt: true } }); } catch { operationalTasks = []; }
    const assignedTasks: AssignedTask[] = operationalTasks.filter((task) => ["QUEUED", "RUNNING", "AWAITING_APPROVAL"].includes(task.status)).map((task) => ({ id: task.id, agent: task.agent as AgentId, title: task.title, status: task.status as AgentTaskStatus, updatedAt: task.updatedAt }));
    const agents = buildTeamAiAgentCards({ openAiConfigured: Boolean(config.apiKey), databaseAvailable: true, complexModel: config.complexModel, assignedTasks });
    const unattributedUsage: UnattributedUsage = { inputTokens: usage._sum.inputTokens ?? 0, outputTokens: usage._sum.outputTokens ?? 0, totalTokens: usage._sum.totalTokens ?? 0, invocationCount: usage._count._all, trackingStartedAt: firstInvocation?.createdAt.toISOString() ?? null, latestInvocation: latestInvocation ? { ...latestInvocation, createdAt: latestInvocation.createdAt.toISOString() } : null, costStatus: "NOT_CONFIGURED" };
    return { databaseConfigured: true, databaseAvailable: true, agents, configuredAgents: agents.filter((agent) => agent.status === "AVAILABLE").length, runningAgents: agents.filter((agent) => agent.status === "RUNNING").length, totalRecordedTokens: unattributedUsage.totalTokens, usageScope: "FROM_AUDIT_ACTIVATION", unattributedUsage, recentActivities: recentActivities.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })), recentOperationalTasks: operationalTasks.map((task) => ({ ...task, agent: task.agent as AgentId, status: task.status as AgentTaskStatus, updatedAt: task.updatedAt.toISOString() })) };
  } catch {
    const agents = buildTeamAiAgentCards({ openAiConfigured: Boolean(config.apiKey), databaseAvailable: false, complexModel: config.complexModel });
    return { databaseConfigured: true, databaseAvailable: false, agents, configuredAgents: 0, runningAgents: 0, totalRecordedTokens: 0, usageScope: "FROM_AUDIT_ACTIVATION", unattributedUsage: emptyUsage(), recentActivities: [], recentOperationalTasks: [] };
  }
}
