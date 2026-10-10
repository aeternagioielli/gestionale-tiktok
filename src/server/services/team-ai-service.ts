import { getOpenAiConfig } from "@/server/ai/config";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";

export const TEAM_AI_AGENTS = [
  {
    id: "lorenzo",
    name: "Lorenzo",
    role: "CEO",
    scope: "Strategia e coordinamento.",
  },
  {
    id: "marco",
    name: "Marco",
    role: "Marketing",
    scope: "Campagne pubblicitarie e acquisizione clienti.",
  },
  {
    id: "giulia",
    name: "Giulia",
    role: "Creative",
    scope: "Contenuti, immagini e video.",
  },
  {
    id: "alessandro",
    name: "Alessandro",
    role: "E-commerce & SEO",
    scope: "Shopify e posizionamento Google.",
  },
  {
    id: "matteo",
    name: "Matteo",
    role: "Ordini & Supporto",
    scope: "Ordini e assistenza clienti.",
  },
  {
    id: "francesca",
    name: "Francesca",
    role: "Finanza",
    scope: "Costi, margini e performance economiche.",
  },
] as const;

export type TeamAiAgentId = (typeof TEAM_AI_AGENTS)[number]["id"];
export type TeamAiAgentStatus = "AVAILABLE" | "RUNNING" | "ERROR" | "NOT_CONFIGURED";

export type TeamAiAgentCard = (typeof TEAM_AI_AGENTS)[number] & {
  status: TeamAiAgentStatus;
  statusReason: string;
  currentActivity: string;
  configuredModel: string | null;
  actualModel: null;
  inputTokens: null;
  outputTokens: null;
  totalTokens: null;
  estimatedCostUsd: number | null;
  lastExecutionAt: null;
};

export type UnattributedUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  invocationCount: number;
  trackingStartedAt: string | null;
  latestInvocation: {
    model: string;
    taskType: string;
    status: string;
    createdAt: string;
  } | null;
  costStatus: "NOT_CONFIGURED";
};

export type TeamAiDashboardData = {
  databaseConfigured: boolean;
  databaseAvailable: boolean;
  agents: TeamAiAgentCard[];
  configuredAgents: number;
  runningAgents: number;
  totalRecordedTokens: number;
  usageScope: "FROM_AUDIT_ACTIVATION";
  unattributedUsage: UnattributedUsage;
};

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

export function buildTeamAiAgentCards(input: {
  openAiConfigured: boolean;
  databaseAvailable: boolean;
  complexModel: string;
}): TeamAiAgentCard[] {
  return TEAM_AI_AGENTS.map((agent) => {
    const isLorenzo = agent.id === "lorenzo";
    const available = isLorenzo && input.openAiConfigured && input.databaseAvailable;
    return {
      ...agent,
      status: available ? "AVAILABLE" : "NOT_CONFIGURED",
      statusReason: available
        ? "Report CEO disponibile su richiesta; nessuna esecuzione autonoma è attiva."
        : isLorenzo
          ? "Richiede OpenAI e il database per generare e salvare i report CEO."
          : "Interfaccia predisposta: la funzione operativa non è ancora implementata.",
      currentActivity: available
        ? "In attesa di una richiesta manuale per generare un report CEO."
        : "Nessuna attività conosciuta.",
      configuredModel: isLorenzo ? input.complexModel : null,
      actualModel: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
      lastExecutionAt: null,
    };
  });
}

function emptyDashboard(): TeamAiDashboardData {
  const config = getOpenAiConfig();
  const agents = buildTeamAiAgentCards({
    openAiConfigured: Boolean(config.apiKey),
    databaseAvailable: false,
    complexModel: config.complexModel,
  });
  return {
    databaseConfigured: false,
    databaseAvailable: false,
    agents,
    configuredAgents: 0,
    runningAgents: 0,
    totalRecordedTokens: 0,
    usageScope: "FROM_AUDIT_ACTIVATION",
    unattributedUsage: emptyUsage(),
  };
}

export async function getTeamAiDashboardData(): Promise<TeamAiDashboardData> {
  if (!isDatabaseConfigured()) return emptyDashboard();
  const config = getOpenAiConfig();
  try {
    const db = getDatabaseClient();
    const [usage, firstInvocation, latestInvocation] = await Promise.all([
      db.aiInvocation.aggregate({
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      }),
      db.aiInvocation.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      db.aiInvocation.findFirst({
        orderBy: { createdAt: "desc" },
        select: { model: true, taskType: true, status: true, createdAt: true },
      }),
    ]);
    const agents = buildTeamAiAgentCards({
      openAiConfigured: Boolean(config.apiKey),
      databaseAvailable: true,
      complexModel: config.complexModel,
    });
    const unattributedUsage: UnattributedUsage = {
      inputTokens: usage._sum.inputTokens ?? 0,
      outputTokens: usage._sum.outputTokens ?? 0,
      totalTokens: usage._sum.totalTokens ?? 0,
      invocationCount: usage._count._all,
      trackingStartedAt: firstInvocation?.createdAt.toISOString() ?? null,
      latestInvocation: latestInvocation
        ? {
            model: latestInvocation.model,
            taskType: latestInvocation.taskType,
            status: latestInvocation.status,
            createdAt: latestInvocation.createdAt.toISOString(),
          }
        : null,
      costStatus: "NOT_CONFIGURED",
    };
    return {
      databaseConfigured: true,
      databaseAvailable: true,
      agents,
      configuredAgents: agents.filter((agent) => agent.status === "AVAILABLE").length,
      runningAgents: 0,
      totalRecordedTokens: unattributedUsage.totalTokens,
      usageScope: "FROM_AUDIT_ACTIVATION",
      unattributedUsage,
    };
  } catch {
    const agents = buildTeamAiAgentCards({
      openAiConfigured: Boolean(config.apiKey),
      databaseAvailable: false,
      complexModel: config.complexModel,
    });
    return {
      databaseConfigured: true,
      databaseAvailable: false,
      agents,
      configuredAgents: 0,
      runningAgents: 0,
      totalRecordedTokens: 0,
      usageScope: "FROM_AUDIT_ACTIVATION",
      unattributedUsage: emptyUsage(),
    };
  }
}
