import { IntegrationStatus } from "@/generated/prisma/enums";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";
import { getBlockedTasks, getNextPriorityTask } from "@/server/domain/task-engine";
import { getGoalOverviewSnapshot, toGoalRecord } from "@/server/services/goal-service";
import { listPersistedTasks, toDomainTask } from "@/server/services/task-service";

export type OverviewData = {
  databaseConfigured: boolean;
  goal: ReturnType<typeof getGoalOverviewSnapshot> | null;
  priorityTask: {
    id: string;
    title: string;
    description: string | null;
    priority: number;
    status: string;
    goalPhaseId: string | null;
    dueDate: Date | null;
  } | null;
  blockedTasks: {
    id: string;
    title: string;
    status: string;
    goalPhaseId: string | null;
    missingPrerequisites: string[];
  }[];
  activities: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: Date;
  }[];
  integrations: { type: string; name: string; status: string; lastSyncedAt: Date | null }[];
  report: {
    reportDate: Date;
    generalSituation: string;
    priorityOne: string;
    progressToFive: number | null;
  } | null;
  metrics: {
    orders: number | null;
    sales: number | null;
    products: number | null;
    inventory: number | null;
    customers: number | null;
    website: number | null;
    advertising: number | null;
  };
};

const integrationDefaults = [
  ["SHOPIFY", "Shopify"],
  ["META_ADS", "Meta Ads"],
  ["ANALYTICS", "Analytics"],
  ["OPENAI_ASTRA", "Astra / OpenAI"],
] as const;

export function emptyOverviewData(): OverviewData {
  return {
    databaseConfigured: false,
    goal: null,
    priorityTask: null,
    blockedTasks: [],
    activities: [],
    integrations: integrationDefaults.map(([type, name]) => ({
      type,
      name,
      status: IntegrationStatus.NOT_CONFIGURED,
      lastSyncedAt: null,
    })),
    report: null,
    metrics: {
      orders: null,
      sales: null,
      products: null,
      inventory: null,
      customers: null,
      website: null,
      advertising: null,
    },
  };
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfTomorrow(): Date {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

export async function getOverviewData(): Promise<OverviewData> {
  if (!isDatabaseConfigured()) return emptyOverviewData();
  const db = getDatabaseClient();
  const [
    goal,
    persistedTasks,
    activities,
    integrations,
    report,
    ordersToday,
    ordersTotal,
    sales,
    products,
    inventory,
    customers,
  ] = await Promise.all([
    db.goal.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      include: { phases: { orderBy: { position: "asc" } } },
    }),
    listPersistedTasks(),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
    db.integration.findMany({
      orderBy: { createdAt: "asc" },
      select: { type: true, name: true, status: true, lastSyncedAt: true },
    }),
    db.astraReport.findFirst({
      orderBy: { reportDate: "desc" },
      select: { reportDate: true, generalSituation: true, priorityOne: true, progressToFive: true },
    }),
    db.order.count({ where: { orderDate: { gte: startOfToday(), lt: startOfTomorrow() } } }),
    db.order.count(),
    db.order.aggregate({ _sum: { totalAmount: true } }),
    db.product.count(),
    db.inventoryItem.count(),
    db.customer.count(),
  ]);

  const domainTasks = persistedTasks.map(toDomainTask);
  const priority = getNextPriorityTask(domainTasks);
  const blocked = getBlockedTasks(domainTasks)
    .filter((task) => task.status === "LOCKED" || task.status === "BLOCKED")
    .slice(0, 3);
  const blockedById = new Map(persistedTasks.map((task) => [task.id, task]));
  const blockedTasks = blocked.map((task) => {
    const persisted = blockedById.get(task.id);
    const missing =
      persisted?.prerequisiteLinks
        .filter((link) => link.prerequisite?.status !== "COMPLETED")
        .map((link) => link.prerequisite?.title ?? link.prerequisiteId) ?? [];
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      goalPhaseId: task.goalPhaseId ?? null,
      missingPrerequisites: missing,
    };
  });
  const mergedIntegrations = integrationDefaults.map(
    ([type, name]) =>
      integrations.find((integration) => integration.type === type) ?? {
        type,
        name,
        status: IntegrationStatus.NOT_CONFIGURED,
        lastSyncedAt: null,
      },
  );
  const goalSnapshot = goal
    ? getGoalOverviewSnapshot(toGoalRecord(goal), ordersTotal > 0 ? ordersToday : null)
    : null;

  return {
    databaseConfigured: true,
    goal: goalSnapshot,
    priorityTask: priority
      ? {
          id: priority.id,
          title: priority.title,
          description: priority.description ?? null,
          priority: priority.priority,
          status: priority.status,
          goalPhaseId: priority.goalPhaseId ?? null,
          dueDate: priority.dueDate ?? null,
        }
      : null,
    blockedTasks,
    activities,
    integrations: mergedIntegrations,
    report: report
      ? {
          reportDate: report.reportDate,
          generalSituation: report.generalSituation,
          priorityOne: report.priorityOne,
          progressToFive: report.progressToFive === null ? null : Number(report.progressToFive),
        }
      : null,
    metrics: {
      orders: ordersTotal > 0 ? ordersToday : null,
      sales:
        ordersTotal > 0 && sales._sum.totalAmount !== null ? Number(sales._sum.totalAmount) : null,
      products: products > 0 ? products : null,
      inventory: inventory > 0 ? inventory : null,
      customers: customers > 0 ? customers : null,
      website: null,
      advertising: null,
    },
  };
}
