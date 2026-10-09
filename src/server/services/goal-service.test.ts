import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeGoal = { id: "goal-1", key: "DAILY_ORDERS_5", name: "5 ORDINI / GIORNO", phases: [] };
const findUnique = vi.fn();
const create = vi.fn();

vi.mock("@/server/db", () => ({ getDatabaseClient: () => ({ goal: { findUnique, create } }) }));

import {
  ensureDefaultGoalStructure,
  getDefaultGoalDefinition,
} from "@/server/services/goal-service";

describe("Goal structure service", () => {
  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
  });

  it("creates the default structure only when missing and is idempotent", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(fakeGoal);
    create.mockResolvedValue(fakeGoal);
    const first = await ensureDefaultGoalStructure();
    const second = await ensureDefaultGoalStructure();
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("defines the generic 0, 1, 3, 5 phase sequence", () => {
    expect(getDefaultGoalDefinition().phases.map((phase) => phase.targetValue)).toEqual([
      0, 1, 3, 5,
    ]);
  });
});
