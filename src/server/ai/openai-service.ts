import OpenAI from "openai";
import { getOpenAiConfig, type OpenAiConfig } from "@/server/ai/config";
import { selectAiModel, type AiTaskType } from "@/server/ai/model-router";
import { getDatabaseClient, isDatabaseConfigured } from "@/server/db";

const MAX_INPUT_CHARACTERS = 24_000;
const MAX_INSTRUCTIONS_CHARACTERS = 4_000;
type ResponseUsage = { input_tokens?: number; output_tokens?: number; total_tokens?: number };
type ResponsesClient = {
  responses: {
    create: (request: {
      model: string;
      input: string;
      instructions?: string;
      max_output_tokens: number;
      store: false;
    }) => Promise<{ output_text: string; usage?: ResponseUsage }>;
  };
};

export type AiInvocationResult = {
  text: string;
  model: string;
  taskType: AiTaskType;
  durationMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
};
export type AiModelVerification = {
  model: string;
  available: boolean;
  errorCode: OpenAiRequestError["code"] | null;
};
export class OpenAiConfigurationError extends Error {
  constructor() {
    super("OpenAI non è configurato: manca OPENAI_API_KEY.");
    this.name = "OpenAiConfigurationError";
  }
}
export class OpenAiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: "MODEL_UNAVAILABLE" | "RATE_LIMITED" | "TIMEOUT" | "REQUEST_FAILED",
  ) {
    super(message);
    this.name = "OpenAiRequestError";
  }
}
type InvocationLog = {
  taskType: AiTaskType;
  model: string;
  status: "COMPLETED" | "FAILED";
  durationMs: number;
  usage?: ResponseUsage;
  errorCode?: OpenAiRequestError["code"];
};

async function persistInvocation(log: InvocationLog): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDatabaseClient().aiInvocation.create({
    data: {
      taskType: log.taskType,
      model: log.model,
      status: log.status,
      durationMs: log.durationMs,
      inputTokens: log.usage?.input_tokens ?? null,
      outputTokens: log.usage?.output_tokens ?? null,
      totalTokens: log.usage?.total_tokens ?? null,
      errorCode: log.errorCode ?? null,
    },
  });
}
function toRequestError(error: unknown): OpenAiRequestError {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const name = error instanceof Error ? error.name : "";
  if (error instanceof DOMException && error.name === "AbortError")
    return new OpenAiRequestError("La richiesta OpenAI ha superato il timeout.", "TIMEOUT");
  if (name === "APIConnectionTimeoutError")
    return new OpenAiRequestError("La richiesta OpenAI ha superato il timeout.", "TIMEOUT");
  if (status === 429)
    return new OpenAiRequestError("OpenAI ha raggiunto un limite di utilizzo.", "RATE_LIMITED");
  if (status === 403 || status === 404)
    return new OpenAiRequestError(
      "Il modello OpenAI selezionato non è accessibile per questo progetto.",
      "MODEL_UNAVAILABLE",
    );
  return new OpenAiRequestError("La richiesta OpenAI non è riuscita.", "REQUEST_FAILED");
}

export class OpenAiService {
  constructor(
    private readonly config: OpenAiConfig = getOpenAiConfig(),
    private readonly client: ResponsesClient | null = config.apiKey
      ? (new OpenAI({
          apiKey: config.apiKey,
          timeout: config.timeoutMs,
          maxRetries: 0,
        }) as ResponsesClient)
      : null,
    private readonly writeLog: (entry: InvocationLog) => Promise<void> = persistInvocation,
  ) {}
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Performs three deliberately tiny server-side Responses requests. It never writes
   * audit data, so a production connectivity check cannot mutate the application DB.
   */
  async verifyConfiguredModels(): Promise<AiModelVerification[]> {
    if (!this.client) throw new OpenAiConfigurationError();
    const models = [this.config.simpleModel, this.config.standardModel, this.config.complexModel];
    const results: AiModelVerification[] = [];
    for (const model of models) {
      try {
        await this.client.responses.create({
          model,
          input: "Reply only with OK.",
          max_output_tokens: 16,
          store: false,
        });
        results.push({ model, available: true, errorCode: null });
      } catch (error) {
        results.push({ model, available: false, errorCode: toRequestError(error).code });
      }
    }
    return results;
  }

  async generate(input: {
    taskType: AiTaskType;
    prompt: string;
    instructions?: string;
  }): Promise<AiInvocationResult> {
    if (!this.client) throw new OpenAiConfigurationError();
    if (!input.prompt.trim() || input.prompt.length > MAX_INPUT_CHARACTERS)
      throw new OpenAiRequestError("Prompt OpenAI non valido o troppo lungo.", "REQUEST_FAILED");
    if (input.instructions && input.instructions.length > MAX_INSTRUCTIONS_CHARACTERS)
      throw new OpenAiRequestError("Istruzioni OpenAI troppo lunghe.", "REQUEST_FAILED");
    const selection = selectAiModel(input.taskType, this.config);
    const startedAt = Date.now();
    try {
      const response = await this.client.responses.create({
        model: selection.model,
        input: input.prompt,
        ...(input.instructions ? { instructions: input.instructions } : {}),
        max_output_tokens: selection.maxOutputTokens,
        store: false,
      });
      const durationMs = Date.now() - startedAt;
      try {
        await this.writeLog({
          taskType: input.taskType,
          model: selection.model,
          status: "COMPLETED",
          durationMs,
          usage: response.usage,
        });
      } catch {
        // Never turn an already-completed paid request into a failure or issue it again.
      }
      return {
        text: response.output_text,
        model: selection.model,
        taskType: input.taskType,
        durationMs,
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null,
        },
      };
    } catch (error) {
      const requestError = error instanceof OpenAiRequestError ? error : toRequestError(error);
      try {
        await this.writeLog({
          taskType: input.taskType,
          model: selection.model,
          status: "FAILED",
          durationMs: Date.now() - startedAt,
          errorCode: requestError.code,
        });
      } catch {
        /* logging never masks the provider error */
      }
      throw requestError;
    }
  }
}
