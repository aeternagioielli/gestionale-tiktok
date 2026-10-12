import { describe, expect, it } from "vitest";
import {
  AGENT_PROFILES,
  assertAgentTaskTransition,
  createAgentTaskSchema,
  initialAgentTaskStatus,
  hasDuplicateDedupeKey,
  requiresApproval,
} from "@/server/domain/agent-task-workflow";

describe("agent task workflow", () => {
  it("validates a manual assignment to a stable agent", () => {
    const task = createAgentTaskSchema.parse({ agent: "ALESSANDRO", title: "Verificare dati Shopify" });
    expect(task.source).toBe("MANUAL");
    expect(AGENT_PROFILES.find((agent) => agent.id === task.agent)?.role).toBe("E-commerce & SEO");
    expect(initialAgentTaskStatus(task.risk)).toBe("QUEUED");
  });

  it("requires approval before any externally consequential category", () => {
    expect(requiresApproval("PUBLIC_SHOPIFY_CHANGE")).toBe(true);
    expect(requiresApproval("META_CAMPAIGN_CHANGE")).toBe(true);
    expect(requiresApproval("AD_SPEND")).toBe(true);
    expect(requiresApproval("CUSTOMER_COMMUNICATION")).toBe(true);
    expect(requiresApproval("CONTENT_PUBLICATION")).toBe(true);
    expect(initialAgentTaskStatus("AD_SPEND")).toBe("AWAITING_APPROVAL");
  });

  it("allows only explicit state transitions", () => {
    expect(() => assertAgentTaskTransition("QUEUED", "RUNNING")).not.toThrow();
    expect(() => assertAgentTaskTransition("AWAITING_APPROVAL", "QUEUED")).not.toThrow();
    expect(() => assertAgentTaskTransition("COMPLETED", "RUNNING")).toThrow("Transizione non consentita");
  });

  it("rejects malformed or incomplete task input before persistence", () => {
    expect(() => createAgentTaskSchema.parse({ agent: "UNKNOWN", title: "" })).toThrow();
    expect(() => createAgentTaskSchema.parse({ agent: "MARCO", title: "x", priority: 101 })).toThrow();
  });

  it("recognizes a duplicate planning key without recording another task", () => {
    expect(hasDuplicateDedupeKey(["daily:2026-10-12:meta-configuration"], "daily:2026-10-12:meta-configuration")).toBe(true);
    expect(hasDuplicateDedupeKey(["daily:2026-10-12:meta-configuration"], "daily:2026-10-12:shopify-configuration")).toBe(false);
  });
});
