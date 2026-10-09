import { PhaseStatus } from "@/generated/prisma/enums";
import { getDatabaseClient } from "@/server/db";
import {
  calculateGoalProgress,
  getCurrentPhase,
  getNextPhase,
  type GoalRecord,
} from "@/server/domain/goal-engine";

export const DEFAULT_GOAL_KEY = "DAILY_ORDERS_5";

export function getDefaultGoalDefinition(now = new Date()) {
  return {
    key: DEFAULT_GOAL_KEY,
    name: "5 ORDINI / GIORNO",
    targetValue: 5,
    unit: "orders/day",
    startDate: now,
    phases: [
      {
        targetValue: 0,
        position: 0,
        status: PhaseStatus.CURRENT,
        completionCriteria: {
          description: "Punto di partenza: raccogliere i primi dati affidabili.",
        },
      },
      {
        targetValue: 1,
        position: 1,
        status: PhaseStatus.LOCKED,
        completionCriteria: { description: "Raggiungere 1 ordine in una giornata." },
      },
      {
        targetValue: 3,
        position: 2,
        status: PhaseStatus.LOCKED,
        completionCriteria: { description: "Raggiungere 3 ordini in una giornata." },
      },
      {
        targetValue: 5,
        position: 3,
        status: PhaseStatus.LOCKED,
        completionCriteria: { description: "Raggiungere 5 ordini in una giornata." },
      },
    ],
  };
}

export async function ensureDefaultGoalStructure() {
  const db = getDatabaseClient();
  const existing = await db.goal.findUnique({
    where: { key: DEFAULT_GOAL_KEY },
    include: { phases: { orderBy: { position: "asc" } } },
  });
  if (existing) return { goal: existing, created: false };

  const definition = getDefaultGoalDefinition();
  try {
    const goal = await db.goal.create({
      data: {
        key: definition.key,
        name: definition.name,
        targetValue: definition.targetValue,
        unit: definition.unit,
        startDate: definition.startDate,
        phases: { create: definition.phases },
      },
      include: { phases: { orderBy: { position: "asc" } } },
    });
    return { goal, created: true };
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const goal = await db.goal.findUniqueOrThrow({
      where: { key: DEFAULT_GOAL_KEY },
      include: { phases: { orderBy: { position: "asc" } } },
    });
    return { goal, created: false };
  }
}

export function toGoalRecord(goal: {
  id: string;
  name: string;
  currentValue: unknown;
  targetValue: unknown;
  unit: string;
  status: string;
  phases: { id: string; targetValue: unknown; position: number; status: string }[];
}): GoalRecord {
  return {
    id: goal.id,
    name: goal.name,
    currentValue: Number(goal.currentValue),
    targetValue: Number(goal.targetValue),
    unit: goal.unit,
    status: goal.status as GoalRecord["status"],
    phases: goal.phases.map((phase) => ({
      id: phase.id,
      targetValue: Number(phase.targetValue),
      position: phase.position,
      status: phase.status as "LOCKED" | "CURRENT" | "COMPLETED",
    })),
  };
}

export function getGoalOverviewSnapshot(
  goal: Parameters<typeof toGoalRecord>[0],
  currentValue: number | null,
) {
  const record = toGoalRecord(goal);
  const currentPhase = getCurrentPhase(record, currentValue ?? undefined);
  const phasesForEngine = currentPhase
    ? record.phases.map((phase) =>
        phase.id === currentPhase.id ? { ...phase, status: "CURRENT" as const } : phase,
      )
    : record.phases;
  const nextPhase = getNextPhase({ phases: phasesForEngine }, currentValue ?? undefined);
  return {
    id: record.id,
    name: record.name,
    target: record.targetValue,
    unit: record.unit,
    currentValue,
    progress:
      currentValue === null
        ? null
        : calculateGoalProgress({ currentValue, targetValue: record.targetValue }),
    status: record.status,
    phases: record.phases.map((phase) => ({
      id: phase.id,
      target: phase.targetValue,
      position: phase.position,
      status: phase.status,
    })),
    currentPhase: currentPhase
      ? {
          id: currentPhase.id,
          target: currentPhase.targetValue,
          position: currentPhase.position,
          status: currentPhase.status,
        }
      : null,
    nextPhase: nextPhase
      ? {
          id: nextPhase.id,
          target: nextPhase.targetValue,
          position: nextPhase.position,
          status: nextPhase.status,
        }
      : null,
  };
}

export async function listGoals() {
  return getDatabaseClient().goal.findMany({
    orderBy: { createdAt: "asc" },
    include: { phases: { orderBy: { position: "asc" } } },
  });
}

export async function getGoalById(id: string) {
  return getDatabaseClient().goal.findUnique({
    where: { id },
    include: { phases: { orderBy: { position: "asc" } } },
  });
}
