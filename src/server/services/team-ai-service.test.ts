import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTeamAiAgentCards, getTeamAiDashboardData } from "@/server/services/team-ai-service";

const db = vi.hoisted(() => ({
  aiInvocation: { aggregate: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  agentTask: { groupBy: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/server/db", () => ({ isDatabaseConfigured: () => true, getDatabaseClient: () => db }));
vi.mock("@/server/ai/config", () => ({
  getOpenAiConfig: () => ({ apiKey: true, complexModel: "gpt-6-astra" }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.aiInvocation.aggregate.mockResolvedValue({ _sum: {}, _count: { _all: 0 } });
  db.aiInvocation.findFirst.mockResolvedValue(null);
  db.aiInvocation.findMany.mockResolvedValue([]);
  db.agentTask.groupBy.mockResolvedValue([]);
  db.agentTask.findMany.mockResolvedValue([]);
  db.agentTask.findFirst.mockResolvedValue(null);
});

describe("TEAM AI dashboard", () => {
  it("marks only the implemented Lorenzo service as available", () => {
    const agents = buildTeamAiAgentCards({
      openAiConfigured: true,
      databaseAvailable: true,
      complexModel: "gpt-6-astra",
    });
    expect(agents).toHaveLength(6);
    expect(agents.find((agent) => agent.id === "lorenzo")).toMatchObject({
      status: "AVAILABLE",
      configuredModel: "gpt-6-astra",
      actualModel: null,
      totalTokens: null,
    });
    expect(
      agents
        .filter((agent) => agent.id !== "lorenzo")
        .every((agent) => agent.status === "NOT_CONFIGURED"),
    ).toBe(true);
  });

  it("does not claim an agent is running without persisted execution evidence", () => {
    const agents = buildTeamAiAgentCards({
      openAiConfigured: true,
      databaseAvailable: true,
      complexModel: "gpt-6-astra",
    });
    expect(agents.some((agent) => agent.status === "RUNNING")).toBe(false);
  });

  it("shows only a persisted assignment and its actual queue state", () => {
    const agents = buildTeamAiAgentCards({
      openAiConfigured: true,
      databaseAvailable: true,
      complexModel: "gpt-6-astra",
      assignedTasks: [
        {
          id: "task-1",
          agent: "MARCO",
          title: "Verificare dati Meta",
          status: "QUEUED",
          updatedAt: new Date("2026-10-12T10:00:00.000Z"),
        },
      ],
    });
    expect(agents.find((agent) => agent.id === "marco")).toMatchObject({
      status: "QUEUED",
      assignedTask: { title: "Verificare dati Meta" },
    });
  });
});

describe("Command center read model", () => {
  it("distinguishes an unavailable registry from a genuinely empty one", async () => {
    db.agentTask.groupBy.mockRejectedValueOnce(new Error("missing table"));
    const unavailable = await getTeamAiDashboardData();
    expect(unavailable.tasksAvailable).toBe(false);
    expect(unavailable.databaseAvailable).toBe(true);
    expect(unavailable.taskTotals).toBeNull();
    expect(unavailable.agents.every((agent) => agent.taskCounts === null)).toBe(true);
    const empty = await getTeamAiDashboardData();
    expect(empty.tasksAvailable).toBe(true);
    expect(empty.taskTotals?.total).toBe(0);
  });
  it("counts the whole registry and finds running work outside recent history", async () => {
    db.agentTask.groupBy.mockResolvedValue([
      { agent: "MARCO", status: "COMPLETED", _count: { _all: 45 } },
      { agent: "MARCO", status: "RUNNING", _count: { _all: 1 } },
      { agent: "MARCO", status: "AWAITING_APPROVAL", _count: { _all: 2 } },
    ]);
    db.agentTask.findFirst.mockResolvedValue({
      id: "older-running",
      agent: "MARCO",
      title: "Analisi registrata",
      status: "RUNNING",
      updatedAt: new Date("2026-10-01T12:00:00Z"),
    });
    const result = await getTeamAiDashboardData();
    expect(result.taskTotals).toMatchObject({ total: 48, RUNNING: 1, AWAITING_APPROVAL: 2 });
    expect(result.agents.find((agent) => agent.id === "marco")).toMatchObject({
      status: "RUNNING",
      currentActivity: "Analisi registrata",
      taskCounts: { total: 48 },
    });
    expect(db.agentTask.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agent: "MARCO", status: "RUNNING" } }),
    );
    expect(result.recentOperationalTasks).toEqual([]);
  });
  it("does not hide tasks if AI audit is unavailable", async () => {
    db.aiInvocation.aggregate.mockRejectedValue(new Error("audit unavailable"));
    const result = await getTeamAiDashboardData();
    expect(result.databaseAvailable).toBe(false);
    expect(result.tasksAvailable).toBe(true);
  });
  it("does not confuse historical failures with current execution", async () => {
    db.agentTask.groupBy.mockResolvedValue([
      { agent: "MARCO", status: "FAILED", _count: { _all: 2 } },
    ]);
    const result = await getTeamAiDashboardData();
    expect(result.agents.find((agent) => agent.id === "marco")).toMatchObject({
      status: "NOT_CONFIGURED",
      currentActivity: null,
      taskCounts: { FAILED: 2 },
    });
    expect(db.agentTask.findFirst).not.toHaveBeenCalled();
  });
});
