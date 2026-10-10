import { z } from "zod";
import { AuditAction } from "@/generated/prisma/enums";
import { OpenAiService } from "@/server/ai/openai-service";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";

const REPORT_HISTORY_LIMIT = 12;
const PREVIOUS_REPORT_LIMIT = 3;
const RECENT_ORDER_LIMIT = 20;
const PRODUCT_LIMIT = 20;
const INVENTORY_LIMIT = 20;
const TASK_LIMIT = 30;
const TEAM_MEMBERS = ["Marco", "Giulia", "Alessandro", "Matteo", "Francesca"] as const;

const generatedReportSchema = z.object({
  generalSituation: z.string().trim().min(1).max(4_000),
  orders: z.object({
    summary: z.string().trim().min(1).max(2_000),
    observations: z.array(z.string().trim().min(1).max(800)).max(6),
  }),
  trend: z.string().trim().min(1).max(2_000),
  whatWorks: z.array(z.string().trim().min(1).max(800)).max(6),
  whatDoesNotWork: z.array(z.string().trim().min(1).max(800)).max(6),
  problems: z.array(z.string().trim().min(1).max(800)).max(8),
  opportunities: z.array(z.string().trim().min(1).max(800)).max(8),
  priorityOne: z.string().trim().min(1).max(800),
  priorities: z.array(z.string().trim().min(1).max(800)).length(3),
  recommendedTasks: z
    .array(
      z.object({
        person: z.enum(TEAM_MEMBERS),
        actions: z.array(z.string().trim().min(1).max(800)).min(1).max(3),
      }),
    )
    .length(TEAM_MEMBERS.length),
});

type GeneratedReport = z.infer<typeof generatedReportSchema>;

export type LorenzoReportView = GeneratedReport & {
  id: string;
  reportDate: string;
  createdAt: string;
};

export type LorenzoWorkspace = {
  databaseConfigured: boolean;
  databaseAvailable: boolean;
  reports: LorenzoReportView[];
};

export class LorenzoDataError extends Error {
  constructor(message = "I dati aziendali non sono disponibili.") {
    super(message);
    this.name = "LorenzoDataError";
  }
}

export class LorenzoOutputError extends Error {
  constructor() {
    super("L'analisi ricevuta non ha un formato utilizzabile.");
    this.name = "LorenzoOutputError";
  }
}

function dayStart(daysAgo = 0): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function toNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseLorenzoReport(text: string): GeneratedReport {
  try {
    return generatedReportSchema.parse(JSON.parse(stripJsonFence(text)));
  } catch {
    throw new LorenzoOutputError();
  }
}

export function buildLorenzoPrompt(snapshot: unknown): string {
  return [
    "Sei LORENZO, CEO AI di AETERNA. Produci una sola analisi manageriale in italiano.",
    "Usa esclusivamente i dati nel JSON seguente. Non dedurre fatti, metriche, ruoli, risultati o integrazioni non presenti.",
    "Se una sezione non contiene dati sufficienti, dichiaralo in modo esplicito e proponi solo il prossimo controllo utile.",
    "Non impartire comandi a sistemi esterni e non proporre modifiche automatiche a prezzi, prodotti, campagne, finanze o task.",
    "Le assegnazioni a Marco, Giulia, Alessandro, Matteo e Francesca sono raccomandazioni: non assumere ruoli aziendali non forniti.",
    "Rispondi esclusivamente con JSON valido, senza Markdown né testo prima o dopo, aderendo esattamente a questa forma:",
    JSON.stringify({
      generalSituation: "string",
      orders: { summary: "string", observations: ["string"] },
      trend: "string",
      whatWorks: ["string"],
      whatDoesNotWork: ["string"],
      problems: ["string"],
      opportunities: ["string"],
      priorityOne: "string",
      priorities: ["string", "string", "string"],
      recommendedTasks: TEAM_MEMBERS.map((person) => ({ person, actions: ["string"] })),
    }),
    "DATI AZIENDALI VERIFICABILI:",
    JSON.stringify(snapshot),
  ].join("\n");
}

function toReportView(report: {
  id: string;
  reportDate: Date;
  createdAt: Date;
  generalSituation: string;
  orders: unknown;
  trend: string;
  whatWorks: unknown;
  whatDoesNotWork: unknown;
  problems: unknown;
  opportunities: unknown;
  recommendedTasks: unknown;
  priorityOne: string;
}): LorenzoReportView | null {
  const savedRecommendations = report.recommendedTasks;
  const priorities =
    typeof savedRecommendations === "object" &&
    savedRecommendations !== null &&
    "priorities" in savedRecommendations
      ? (savedRecommendations as { priorities?: unknown }).priorities
      : undefined;
  const recommendedTasks =
    typeof savedRecommendations === "object" &&
    savedRecommendations !== null &&
    "team" in savedRecommendations
      ? (savedRecommendations as { team?: unknown }).team
      : savedRecommendations;
  const parsed = generatedReportSchema.safeParse({
    generalSituation: report.generalSituation,
    orders: report.orders,
    trend: report.trend,
    whatWorks: report.whatWorks,
    whatDoesNotWork: report.whatDoesNotWork,
    problems: report.problems,
    opportunities: report.opportunities,
    priorityOne: report.priorityOne,
    priorities,
    recommendedTasks,
  });
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    id: report.id,
    reportDate: report.reportDate.toISOString(),
    createdAt: report.createdAt.toISOString(),
  };
}

async function getBusinessSnapshot() {
  const db = getDatabaseClient();
  const [
    ordersToday,
    ordersLastSevenDays,
    ordersLastThirtyDays,
    allOrders,
    recentOrders,
    products,
    inventory,
    activeGoals,
    tasks,
    previousReports,
  ] = await Promise.all([
    db.order.aggregate({
      where: { orderDate: { gte: dayStart() } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    db.order.aggregate({
      where: { orderDate: { gte: dayStart(6) } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    db.order.aggregate({
      where: { orderDate: { gte: dayStart(29) } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    db.order.count(),
    db.order.findMany({
      take: RECENT_ORDER_LIMIT,
      orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
      select: {
        orderDate: true,
        totalAmount: true,
        currency: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
      },
    }),
    db.product.findMany({
      take: PRODUCT_LIMIT,
      orderBy: { updatedAt: "desc" },
      select: { name: true, sku: true, price: true, currency: true, status: true, category: true },
    }),
    db.inventoryItem.findMany({
      take: INVENTORY_LIMIT,
      orderBy: { lastUpdatedAt: "desc" },
      include: { product: { select: { name: true, sku: true } } },
    }),
    db.goal.findMany({
      where: { status: "ACTIVE" },
      take: 10,
      orderBy: { createdAt: "asc" },
      include: {
        phases: {
          orderBy: { position: "asc" },
          select: { targetValue: true, position: true, status: true },
        },
      },
    }),
    db.task.findMany({
      take: TASK_LIMIT,
      orderBy: [{ priority: "asc" }, { position: "asc" }],
      select: {
        title: true,
        description: true,
        status: true,
        priority: true,
        category: true,
        dueDate: true,
        completedAt: true,
      },
    }),
    db.astraReport.findMany({
      take: PREVIOUS_REPORT_LIMIT,
      orderBy: { reportDate: "desc" },
      select: { reportDate: true, generalSituation: true, trend: true, priorityOne: true },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    dataAvailability: {
      orders: allOrders > 0,
      products: products.length > 0,
      inventory: inventory.length > 0,
      goals: activeGoals.length > 0,
      tasks: tasks.length > 0,
      previousReports: previousReports.length > 0,
    },
    orders: {
      totalOrders: allOrders,
      today: { count: ordersToday._count, sales: toNumber(ordersToday._sum.totalAmount) },
      last7Days: {
        count: ordersLastSevenDays._count,
        sales: toNumber(ordersLastSevenDays._sum.totalAmount),
      },
      last30Days: {
        count: ordersLastThirtyDays._count,
        sales: toNumber(ordersLastThirtyDays._sum.totalAmount),
      },
      recent: recentOrders.map((order) => ({
        orderDate: toIso(order.orderDate),
        totalAmount: toNumber(order.totalAmount),
        currency: order.currency,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
      })),
    },
    products: products.map((product) => ({
      name: product.name,
      sku: product.sku,
      price: toNumber(product.price),
      currency: product.currency,
      status: product.status,
      category: product.category,
    })),
    inventory: inventory.map((item) => ({
      productName: item.product.name,
      sku: item.product.sku,
      availableQty: item.availableQty,
      reservedQty: item.reservedQty,
      minimumQty: item.minimumQty,
      lastUpdatedAt: item.lastUpdatedAt.toISOString(),
    })),
    goals: activeGoals.map((goal) => ({
      name: goal.name,
      currentValue: toNumber(goal.currentValue),
      targetValue: toNumber(goal.targetValue),
      unit: goal.unit,
      targetDate: toIso(goal.targetDate),
      phases: goal.phases.map((phase) => ({
        targetValue: toNumber(phase.targetValue),
        position: phase.position,
        status: phase.status,
      })),
    })),
    tasks: tasks.map((task) => ({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      category: task.category,
      dueDate: toIso(task.dueDate),
      completedAt: toIso(task.completedAt),
    })),
    previousReports: previousReports.map((report) => ({
      reportDate: report.reportDate.toISOString(),
      generalSituation: report.generalSituation,
      trend: report.trend,
      priorityOne: report.priorityOne,
    })),
  };
}

export async function getLorenzoWorkspace(): Promise<LorenzoWorkspace> {
  if (!isDatabaseConfigured())
    return { databaseConfigured: false, databaseAvailable: false, reports: [] };
  try {
    const reports = await getDatabaseClient().astraReport.findMany({
      take: REPORT_HISTORY_LIMIT,
      orderBy: { reportDate: "desc" },
      select: {
        id: true,
        reportDate: true,
        createdAt: true,
        generalSituation: true,
        orders: true,
        trend: true,
        whatWorks: true,
        whatDoesNotWork: true,
        problems: true,
        opportunities: true,
        recommendedTasks: true,
        priorityOne: true,
      },
    });
    return {
      databaseConfigured: true,
      databaseAvailable: true,
      reports: reports
        .map(toReportView)
        .filter((report): report is LorenzoReportView => report !== null),
    };
  } catch {
    return { databaseConfigured: true, databaseAvailable: false, reports: [] };
  }
}

export async function generateLorenzoReport(): Promise<LorenzoReportView> {
  if (!isDatabaseConfigured()) throw new LorenzoDataError("Il database non è configurato.");
  let snapshot: Awaited<ReturnType<typeof getBusinessSnapshot>>;
  try {
    snapshot = await getBusinessSnapshot();
  } catch {
    throw new LorenzoDataError();
  }

  const result = await new OpenAiService().generate({
    taskType: "strategy",
    prompt: buildLorenzoPrompt(snapshot),
    instructions:
      "Genera un report CEO affidabile. L'assenza di dati va dichiarata esplicitamente. Non usare strumenti né effettuare azioni.",
  });
  const report = parseLorenzoReport(result.text);
  const reportDate = new Date();
  const db = getDatabaseClient();
  const created = await db.$transaction(async (transaction) => {
    const storedReport = await transaction.astraReport.create({
      data: {
        reportDate,
        generalSituation: report.generalSituation,
        orders: report.orders,
        trend: report.trend,
        whatWorks: report.whatWorks,
        whatDoesNotWork: report.whatDoesNotWork,
        problems: report.problems,
        opportunities: report.opportunities,
        recommendedTasks: { priorities: report.priorities, team: report.recommendedTasks },
        priorityOne: report.priorityOne,
        dataSnapshot: snapshot,
      },
      select: { id: true, reportDate: true, createdAt: true },
    });
    await transaction.auditLog.create({
      data: {
        action: AuditAction.REPORT_GENERATED,
        entityType: "AstraReport",
        entityId: storedReport.id,
        metadata: { source: "LORENZO" },
      },
    });
    return storedReport;
  });
  return {
    ...report,
    id: created.id,
    reportDate: created.reportDate.toISOString(),
    createdAt: created.createdAt.toISOString(),
  };
}
