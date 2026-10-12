import { afterEach, describe, expect, it, vi } from "vitest";
import { requestTeamData, tasksResponse } from "./team-ai-client";

afterEach(() => vi.unstubAllGlobals());
describe("Command center API client", () => {
  it("uses the existing same-origin session and performs no retry", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ tasks: [] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestTeamData("/api/agent-tasks?limit=100", tasksResponse)).resolves.toEqual({
      tasks: [],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/agent-tasks?limit=100",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });
  it.each([
    [401, "Sessione scaduta"],
    [429, "Troppe richieste"],
    [502, "non disponibile"],
    [409, "non può essere aggiornata"],
  ])("handles HTTP %s without exposing server payload", async (status, expected) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "INTERNAL_DETAIL_DO_NOT_RENDER" }, { status })),
    );
    await expect(requestTeamData("/api/agent-tasks", tasksResponse)).rejects.toThrow(
      String(expected),
    );
  });
  it("rejects a login HTML response rather than treating it as empty data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>login</html>", { headers: { "content-type": "text/html" } }),
        ),
    );
    await expect(requestTeamData("/api/agent-tasks", tasksResponse)).rejects.toThrow(
      "Risposta non valida",
    );
  });
  it("rejects malformed JSON and incomplete payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ tasks: [{ id: "incomplete" }] })),
    );
    await expect(requestTeamData("/api/agent-tasks", tasksResponse)).rejects.toThrow(
      "non sono leggibili",
    );
  });
  it("does not replay a mutation after a connection failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("PRIVATE_NETWORK_DETAIL"));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      requestTeamData("/api/agents/daily-plan", tasksResponse, { method: "POST" }),
    ).rejects.toThrow("verificare l'esito");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
