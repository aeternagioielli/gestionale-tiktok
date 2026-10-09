import { z } from "zod";
import { DomainError } from "@/server/domain/errors";

export const goalStatusSchema = z.enum(["ACTIVE", "COMPLETED", "PAUSED", "ARCHIVED"]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;
export type GoalPhase = {
  id: string;
  targetValue: number;
  position: number;
  status: "LOCKED" | "CURRENT" | "COMPLETED";
};
export type GoalRecord = {
  id: string;
  name: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  status: GoalStatus;
  phases: GoalPhase[];
};

export function calculateGoalProgress(
  goal: Pick<GoalRecord, "currentValue" | "targetValue">,
): number {
  if (goal.targetValue <= 0)
    throw new DomainError(
      "Il target dell'obiettivo deve essere maggiore di zero.",
      "INVALID_GOAL_TARGET",
    );
  return Math.min(100, Math.max(0, (goal.currentValue / goal.targetValue) * 100));
}

export function getCurrentPhase(
  goal: Pick<GoalRecord, "phases">,
  currentValue?: number,
): GoalPhase | undefined {
  const phases = [...goal.phases].sort((a, b) => a.position - b.position);
  if (currentValue !== undefined)
    return phases.find((phase) => phase.targetValue >= currentValue) ?? phases.at(-1);
  return (
    phases.find((phase) => phase.status === "CURRENT") ??
    phases.find((phase) => phase.status !== "COMPLETED")
  );
}

export function getNextPhase(
  goal: Pick<GoalRecord, "phases">,
  currentValue?: number,
): GoalPhase | undefined {
  const phases = [...goal.phases].sort((a, b) => a.position - b.position);
  const current = getCurrentPhase(goal, currentValue);
  return current
    ? phases.find((phase) => phase.position > current.position)
    : phases.find((phase) => phase.status !== "COMPLETED");
}

export function getGoalStatus(
  goal: Pick<GoalRecord, "currentValue" | "targetValue" | "status">,
): GoalStatus {
  if (goal.status === "PAUSED" || goal.status === "ARCHIVED") return goal.status;
  return goal.currentValue >= goal.targetValue ? "COMPLETED" : "ACTIVE";
}

export function advanceGoalPhase(goal: GoalRecord): GoalRecord {
  const current = getCurrentPhase(goal);
  if (!current) return goal;
  const next = getNextPhase(goal);
  return {
    ...goal,
    phases: goal.phases.map((phase) =>
      phase.id === current.id
        ? { ...phase, status: "COMPLETED" as const }
        : phase.id === next?.id
          ? { ...phase, status: "CURRENT" as const }
          : phase,
    ),
  };
}
