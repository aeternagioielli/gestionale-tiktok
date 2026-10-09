import { describe, expect, it } from "vitest";
import {
  calculateGoalProgress,
  advanceGoalPhase,
  getCurrentPhase,
  getGoalStatus,
  getNextPhase,
  type GoalRecord,
} from "@/server/domain/goal-engine";

const goal: GoalRecord = {
  id: "goal-1",
  name: "Ordini al giorno",
  currentValue: 0,
  targetValue: 5,
  unit: "orders/day",
  status: "ACTIVE",
  phases: [
    { id: "phase-0", targetValue: 0, position: 0, status: "CURRENT" },
    { id: "phase-1", targetValue: 1, position: 1, status: "LOCKED" },
    { id: "phase-3", targetValue: 3, position: 2, status: "LOCKED" },
    { id: "phase-5", targetValue: 5, position: 3, status: "LOCKED" },
  ],
};

describe("Goal Engine", () => {
  it("calculates a bounded progress percentage", () => {
    expect(calculateGoalProgress({ currentValue: 3, targetValue: 5 })).toBe(60);
    expect(calculateGoalProgress({ currentValue: 8, targetValue: 5 })).toBe(100);
  });

  it("moves through phases 0 to 1 to 3 to 5", () => {
    const atOne = advanceGoalPhase(goal);
    expect(getCurrentPhase(atOne)?.id).toBe("phase-1");
    expect(getNextPhase(atOne)?.id).toBe("phase-3");
    const atThree = advanceGoalPhase(atOne);
    const atFive = advanceGoalPhase(atThree);
    expect(getCurrentPhase(atFive)?.id).toBe("phase-5");
  });

  it("derives completion without storing duplicate progress", () => {
    expect(getGoalStatus({ currentValue: 5, targetValue: 5, status: "ACTIVE" })).toBe("COMPLETED");
    expect(getGoalStatus({ currentValue: 0, targetValue: 5, status: "PAUSED" })).toBe("PAUSED");
    expect(() => calculateGoalProgress({ currentValue: 0, targetValue: 0 })).toThrow();
  });
});
