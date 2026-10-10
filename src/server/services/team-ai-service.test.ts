import { describe, expect, it } from "vitest";
import { buildTeamAiAgentCards } from "@/server/services/team-ai-service";

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
});
