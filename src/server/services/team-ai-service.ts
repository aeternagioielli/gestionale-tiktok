import { getOpenAiConfig } from "@/server/ai/config";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";
import {
  AGENT_PROFILES,
  type AgentId,
  type AgentTaskStatus,
} from "@/server/domain/agent-task-workflow";
import type { AgentTaskView } from "./agent-task-service";

export type TeamAiAgentId = Lowercase<AgentId>;
const cardIds: Record<AgentId, TeamAiAgentId> = {
  LORENZO: "lorenzo",
  MARCO: "marco",
  GIULIA: "giulia",
  ALESSANDRO: "alessandro",
  MATTEO: "matteo",
  FRANCESCA: "francesca",
};
export const TEAM_AI_AGENTS = AGENT_PROFILES.map((agent) => ({ ...agent, id: cardIds[agent.id] }));
export type TeamAiAgentStatus =
  "AVAILABLE" | "QUEUED" | "RUNNING" | "AWAITING_APPROVAL" | "ERROR" | "NOT_CONFIGURED";
export type TaskCounts = Record<AgentTaskStatus, number> & { total: number };
export type TeamAiAgentCard = (typeof TEAM_AI_AGENTS)[number] & {
  status: TeamAiAgentStatus;
  statusReason: string;
  currentActivity: string | null;
  assignedTask: { id: string; title: string; status: AgentTaskStatus; updatedAt: string } | null;
  taskCounts: TaskCounts | null;
  configuredModel: string | null;
  actualModel: null;
  inputTokens: null;
  outputTokens: null;
  totalTokens: null;
  estimatedCostUsd: null;
  lastExecutionAt: null;
};
export type UnattributedUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  invocationCount: number;
  trackingStartedAt: string | null;
  latestInvocation: { model: string; taskType: string; status: string; createdAt: string } | null;
  costStatus: "NOT_CONFIGURED";
};
export type TeamAiDashboardData = {
  databaseConfigured: boolean;
  databaseAvailable: boolean;
  tasksAvailable: boolean;
  agents: TeamAiAgentCard[];
  configuredAgents: number;
  runningAgents: number;
  taskTotals: TaskCounts | null;
  totalRecordedTokens: number;
  usageScope: "FROM_AUDIT_ACTIVATION";
  unattributedUsage: UnattributedUsage;
  recentActivities: {
    id: string;
    model: string;
    taskType: string;
    status: string;
    createdAt: string;
  }[];
  recentOperationalTasks: AgentTaskView[];
};

export function emptyTaskCounts(): TaskCounts {
  return {
    total: 0,
    QUEUED: 0,
    RUNNING: 0,
    COMPLETED: 0,
    FAILED: 0,
    AWAITING_APPROVAL: 0,
    CANCELLED: 0,
  };
}
function emptyUsage(): UnattributedUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    invocationCount: 0,
    trackingStartedAt: null,
    latestInvocation: null,
    costStatus: "NOT_CONFIGURED",
  };
}
type AssignedTask = {
  id: string;
  agent: AgentId;
  title: string;
  status: AgentTaskStatus;
  updatedAt: Date;
};
export function buildTeamAiAgentCards(input: {
  openAiConfigured: boolean;
  databaseAvailable: boolean;
  complexModel: string;
  assignedTasks?: AssignedTask[];
  counts?: Partial<Record<AgentId, TaskCounts>>;
}): TeamAiAgentCard[] {
  return TEAM_AI_AGENTS.map((agent) => {
    const assigned =
      (["RUNNING", "AWAITING_APPROVAL", "QUEUED"] as const)
        .map((status) =>
          input.assignedTasks?.find(
            (task) => cardIds[task.agent] === agent.id && task.status === status,
          ),
        )
        .find(Boolean) ?? null;
    const lorenzoAvailable =
      agent.id === "lorenzo" && input.openAiConfigured && input.databaseAvailable;
    const status: TeamAiAgentStatus = assigned
      ? (assigned.status as "RUNNING" | "AWAITING_APPROVAL" | "QUEUED")
      : lorenzoAvailable
        ? "AVAILABLE"
        : "NOT_CONFIGURED";
    return {
      ...agent,
      status,
      statusReason: assigned
        ? assigned.status === "AWAITING_APPROVAL"
          ? "La proposta richiede la tua approvazione."
          : assigned.status === "QUEUED"
            ? "Attività assegnata. Nessun esecutore automatico attivo."
            : "Attività segnata in esecuzione nel registro. Nessun monitoraggio in tempo reale."
        : lorenzoAvailable
          ? "Analisi CEO disponibile su richiesta."
          : agent.id === "lorenzo"
            ? "Analisi disponibile quando OpenAI e dati aziendali sono raggiungibili."
            : "Ruolo definito. Esecuzione autonoma non ancora configurata.",
      currentActivity: assigned?.status === "RUNNING" ? assigned.title : null,
      assignedTask: assigned
        ? {
            id: assigned.id,
            title: assigned.title,
            status: assigned.status,
            updatedAt: assigned.updatedAt.toISOString(),
          }
        : null,
      taskCounts: input.counts?.[agent.id.toUpperCase() as AgentId] ?? null,
      configuredModel: agent.id === "lorenzo" ? input.complexModel : null,
      actualModel: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
      lastExecutionAt: null,
    };
  });
}

export async function getTeamAiDashboardData(): Promise<TeamAiDashboardData> {
  const config = getOpenAiConfig();
  const databaseConfigured = isDatabaseConfigured();
  const result = {
    databaseConfigured,
    databaseAvailable: false,
    tasksAvailable: false,
    taskTotals: null as TaskCounts | null,
    unattributedUsage: emptyUsage(),
    recentActivities: [] as TeamAiDashboardData["recentActivities"],
    recentOperationalTasks: [] as AgentTaskView[],
  };
  let assignedTasks: AssignedTask[] = [];
  let counts: Partial<Record<AgentId, TaskCounts>> | undefined;
  if (databaseConfigured) {
    const db = getDatabaseClient();
    // Independent reads: an unapplied operational migration must not hide existing reports/audit.
    await Promise.all([
      (async () => {
        try {
          const [usage, first, latest, recent] = await Promise.all([
            db.aiInvocation.aggregate({
              _count: { _all: true },
              _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
            }),
            db.aiInvocation.findFirst({
              orderBy: { createdAt: "asc" },
              select: { createdAt: true },
            }),
            db.aiInvocation.findFirst({
              orderBy: { createdAt: "desc" },
              select: { model: true, taskType: true, status: true, createdAt: true },
            }),
            db.aiInvocation.findMany({
              orderBy: { createdAt: "desc" },
              take: 6,
              select: { id: true, model: true, taskType: true, status: true, createdAt: true },
            }),
          ]);
          result.databaseAvailable = true;
          result.unattributedUsage = {
            inputTokens: usage._sum.inputTokens ?? 0,
            outputTokens: usage._sum.outputTokens ?? 0,
            totalTokens: usage._sum.totalTokens ?? 0,
            invocationCount: usage._count._all,
            trackingStartedAt: first?.createdAt.toISOString() ?? null,
            latestInvocation: latest
              ? { ...latest, createdAt: latest.createdAt.toISOString() }
              : null,
            costStatus: "NOT_CONFIGURED",
          };
          result.recentActivities = recent.map((entry) => ({
            ...entry,
            createdAt: entry.createdAt.toISOString(),
          }));
        } catch {
          /* Unknown is not zero: databaseAvailable remains false. */
        }
      })(),
      (async () => {
        try {
          const [groups, recent] = await Promise.all([
            db.agentTask.groupBy({ by: ["agent", "status"], _count: { _all: true } }),
            db.agentTask.findMany({
              orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
              take: 24,
              select: {
                id: true,
                agent: true,
                title: true,
                description: true,
                source: true,
                priority: true,
                status: true,
                requiresApproval: true,
                approvalReason: true,
                result: true,
                executionId: true,
                aiInvocationId: true,
                parentTaskId: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
          ]);
          const localCounts = Object.fromEntries(
            AGENT_PROFILES.map((agent) => [agent.id, emptyTaskCounts()]),
          ) as Record<AgentId, TaskCounts>;
          const totals = emptyTaskCounts();
          for (const group of groups) {
            localCounts[group.agent][group.status] += group._count._all;
            localCounts[group.agent].total += group._count._all;
            totals[group.status] += group._count._all;
            totals.total += group._count._all;
          }
          // An older running task must not disappear behind the latest 24 history records.
          const active = await Promise.all(
            AGENT_PROFILES.map(async ({ id }) => {
              const status = (["RUNNING", "AWAITING_APPROVAL", "QUEUED"] as const).find(
                (entry) => localCounts[id][entry] > 0,
              );
              if (!status) return null;
              return db.agentTask.findFirst({
                where: { agent: id, status },
                orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
                select: { id: true, agent: true, title: true, status: true, updatedAt: true },
              });
            }),
          );
          assignedTasks = active.filter((task): task is NonNullable<typeof task> => task !== null);
          counts = localCounts;
          result.taskTotals = totals;
          result.tasksAvailable = true;
          result.recentOperationalTasks = recent.map((task) => ({
            ...task,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
          }));
        } catch {
          /* Missing migration or unavailable task registry: keep counts unknown. */
        }
      })(),
    ]);
  }
  const agents = buildTeamAiAgentCards({
    openAiConfigured: Boolean(config.apiKey),
    databaseAvailable: result.databaseAvailable || result.tasksAvailable,
    complexModel: config.complexModel,
    assignedTasks,
    counts,
  });
  return {
    ...result,
    agents,
    configuredAgents: config.apiKey && (result.databaseAvailable || result.tasksAvailable) ? 1 : 0,
    runningAgents: agents.filter((agent) => agent.status === "RUNNING").length,
    totalRecordedTokens: result.unattributedUsage.totalTokens,
    usageScope: "FROM_AUDIT_ACTIVATION",
  };
}
