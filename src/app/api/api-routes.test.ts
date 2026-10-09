import { describe, expect, it } from "vitest";
import { GET as getOverview } from "@/app/api/overview/route";
import { GET as getTasks, POST as createTask } from "@/app/api/tasks/route";
import { POST as completeTask } from "@/app/api/tasks/[id]/complete/route";
import { GET as getGoals } from "@/app/api/goals/route";
import { GET as getShopify, POST as syncShopify } from "@/app/api/integrations/shopify/route";

describe("internal API without a configured database", () => {
  it("returns an explicit empty overview", async () => {
    const response = await getOverview();
    expect(response.status).toBe(200);
    expect((await response.json()).databaseConfigured).toBe(false);
  });

  it("returns empty collections instead of crashing", async () => {
    expect((await getTasks()).status).toBe(200);
    expect((await getGoals()).status).toBe(200);
  });

  it("rejects invalid task input before database access", async () => {
    const response = await createTask(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns a clear unavailable status for task completion", async () => {
    const response = await completeTask(
      new Request("http://localhost/api/tasks/task-1/complete", { method: "POST" }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(response.status).toBe(503);
  });

  it("keeps Shopify explicitly unconfigured without credentials", async () => {
    const response = await getShopify();
    expect(response.status).toBe(200);
    expect((await response.json()).configured).toBe(false);
  });

  it("does not start a Shopify sync without credentials", async () => {
    const response = await syncShopify();
    expect([409, 503]).toContain(response.status);
  });
});
