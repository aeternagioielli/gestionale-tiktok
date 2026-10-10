import { NextResponse } from "next/server";
import {
  OpenAiConfigurationError,
  OpenAiService,
  type AiModelVerification,
} from "@/server/ai/openai-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MINIMUM_TEST_INTERVAL_MS = 5 * 60 * 1000;
let lastVerificationAt = 0;

function responseStatus(results: AiModelVerification[]): number {
  if (results.every((result) => result.available)) return 200;
  if (results.some((result) => result.errorCode === "RATE_LIMITED")) return 429;
  return 502;
}

/**
 * Protected by the application proxy. This on-demand check only calls OpenAI with a
 * fixed 16-token request per configured model; it reads/writes neither Shopify, Meta nor PostgreSQL.
 */
export async function POST() {
  const now = Date.now();
  const retryAfterSeconds = Math.ceil(
    (lastVerificationAt + MINIMUM_TEST_INTERVAL_MS - now) / 1_000,
  );
  if (retryAfterSeconds > 0)
    return NextResponse.json(
      { error: "Verifica OpenAI eseguita troppo di recente.", retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );

  lastVerificationAt = now;
  try {
    const models = await new OpenAiService().verifyConfiguredModels();
    return NextResponse.json({ models }, { status: responseStatus(models) });
  } catch (error) {
    if (error instanceof OpenAiConfigurationError)
      return NextResponse.json({ error: "OpenAI non è configurato." }, { status: 503 });
    return NextResponse.json({ error: "Verifica OpenAI non riuscita." }, { status: 503 });
  }
}
