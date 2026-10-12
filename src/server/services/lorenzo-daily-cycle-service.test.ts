import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  isDatabaseConfigured: () => false,
  getDatabaseClient: vi.fn(),
}));

vi.mock("@/server/services/agent-task-service", () => ({ createAgentTask: vi.fn() }));

import { getDailyLorenzoPlan } from "@/server/services/lorenzo-daily-cycle-service";

describe("Lorenzo daily operational plan", () => {
  it("does not invent opportunities when business data are unavailable", async () => {
    const plan = await getDailyLorenzoPlan(new Date("2026-10-12T09:00:00.000Z"));
    expect(plan.databaseConfigured).toBe(false);
    expect(plan.proposals).toEqual([]);
    expect(plan.notes.join(" ")).toContain("non e possibile");
  });
});
