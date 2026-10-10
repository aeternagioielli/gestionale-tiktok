import { describe, expect, it, vi } from "vitest";
import { getOpenAiConfig } from "@/server/ai/config";
import { selectAiModel } from "@/server/ai/model-router";
import { OpenAiService } from "@/server/ai/openai-service";

const config = getOpenAiConfig({ OPENAI_API_KEY: "test-key" });

describe("OpenAI model policy", () => {
  it("routes only explicit task categories to the expected tier", () => {
    expect(selectAiModel("summary", config).model).toBe("gpt-6-luna");
    expect(selectAiModel("seo_analysis", config).model).toBe("gpt-6.1-sol");
    expect(selectAiModel("strategy", config).model).toBe("gpt-6-astra");
  });

  it("uses a mocked Responses API and logs usage without prompt content", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: "Sintesi simulata",
      usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
    });
    const writeLog = vi.fn().mockResolvedValue(undefined);
    const service = new OpenAiService(config, { responses: { create } }, writeLog);
    await expect(
      service.generate({ taskType: "summary", prompt: "Dato riservato" }),
    ).resolves.toMatchObject({
      text: "Sintesi simulata",
      model: "gpt-6-luna",
      usage: { totalTokens: 18 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-6-luna", store: false }),
    );
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: "summary",
        model: "gpt-6-luna",
        status: "COMPLETED",
        usage: expect.objectContaining({ total_tokens: 18 }),
      }),
    );
    expect(JSON.stringify(writeLog.mock.calls)).not.toContain("Dato riservato");
  });

  it("does not retry a rate-limited request and logs a safe error code", async () => {
    const create = vi.fn().mockRejectedValue({ status: 429 });
    const writeLog = vi.fn().mockResolvedValue(undefined);
    const service = new OpenAiService(config, { responses: { create } }, writeLog);
    await expect(
      service.generate({ taskType: "planning", prompt: "Pianifica" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", errorCode: "RATE_LIMITED" }),
    );
  });

  it("classifies SDK timeouts without retrying", async () => {
    const timeout = new Error("timed out");
    timeout.name = "APIConnectionTimeoutError";
    const create = vi.fn().mockRejectedValue(timeout);
    const service = new OpenAiService(config, { responses: { create } }, vi.fn());
    await expect(
      service.generate({ taskType: "routine_check", prompt: "Controlla" }),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("checks all three configured models with fixed low-cost requests and no audit log", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: "OK" });
    const writeLog = vi.fn().mockResolvedValue(undefined);
    const service = new OpenAiService(config, { responses: { create } }, writeLog);
    await expect(service.verifyConfiguredModels()).resolves.toEqual([
      { model: "gpt-6-luna", available: true, errorCode: null },
      { model: "gpt-6.1-sol", available: true, errorCode: null },
      { model: "gpt-6-astra", available: true, errorCode: null },
    ]);
    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: "gpt-6-luna", max_output_tokens: 16, store: false }),
    );
    expect(writeLog).not.toHaveBeenCalled();
  });
});
