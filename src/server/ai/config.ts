import type { AiModelSettings } from "@/server/ai/model-router";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function modelName(value: string | undefined, fallback: string): string {
  const model = value?.trim() || fallback;
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Nome modello OpenAI non valido.");
  return model;
}
export type OpenAiConfig = AiModelSettings & { apiKey: string | null; timeoutMs: number };
export function getOpenAiConfig(
  env: Record<string, string | undefined> = process.env,
): OpenAiConfig {
  return {
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    simpleModel: modelName(env.OPENAI_SIMPLE_MODEL, "gpt-6-luna"),
    standardModel: modelName(env.OPENAI_STANDARD_MODEL, "gpt-6.1-sol"),
    complexModel: modelName(env.OPENAI_COMPLEX_MODEL, "gpt-6-astra"),
    simpleMaxOutputTokens: positiveInteger(env.OPENAI_SIMPLE_MAX_OUTPUT_TOKENS, 800),
    standardMaxOutputTokens: positiveInteger(env.OPENAI_STANDARD_MAX_OUTPUT_TOKENS, 1_600),
    complexMaxOutputTokens: positiveInteger(env.OPENAI_COMPLEX_MAX_OUTPUT_TOKENS, 3_200),
    timeoutMs: positiveInteger(env.OPENAI_TIMEOUT_MS, 20_000),
  };
}
