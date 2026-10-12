import { NextResponse } from "next/server";
import { z } from "zod";
import { ShopifyApiError, ShopifyAuthenticationError, ShopifyConfigurationError } from "@/integrations/shopify/shopify.adapter";
import { OpenAiConfigurationError, OpenAiRequestError } from "@/server/ai/openai-service";
import { ShopifySeoAnalysisError, runShopifySeoAnalysis } from "@/server/services/shopify-seo-analysis-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Protected by the application proxy. This is an explicit manual action, never a scheduler.
 * It reads Shopify only and creates approval-gated local proposals.
 */
const requestSchema = z.object({ retryFailed: z.boolean().optional() }).strict();

export async function POST(request: Request) {
  let retryFailed = false;
  try {
    const body = await request.text();
    if (body) retryFailed = requestSchema.parse(JSON.parse(body)).retryFailed ?? false;
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  try {
    const result = await runShopifySeoAnalysis({ retryFailed });
    return NextResponse.json({ data: result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof ShopifyConfigurationError)
      return NextResponse.json({ error: "Shopify non e configurato." }, { status: 409 });
    if (error instanceof ShopifyAuthenticationError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof ShopifyApiError)
      return NextResponse.json(
        { error: error.message, retryAfterSeconds: error.retryAfterSeconds ?? null },
        { status: error.status === 429 ? 429 : 502 },
      );
    if (error instanceof OpenAiConfigurationError)
      return NextResponse.json({ error: "OpenAI non e configurato." }, { status: 503 });
    if (error instanceof OpenAiRequestError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "RATE_LIMITED" ? 429 : 502 });
    if (error instanceof ShopifySeoAnalysisError) {
      const status = error.code === "DATABASE_NOT_CONFIGURED" ? 503 : error.code.startsWith("CATALOG_") ? 422 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "Analisi SEO Shopify non riuscita." }, { status: 500 });
  }
}
