import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OpenAiConfigurationError, OpenAiRequestError } from "@/server/ai/openai-service";
import { ShopifyApiError, ShopifyAuthenticationError, ShopifyConfigurationError } from "@/integrations/shopify/shopify.adapter";
import {
  ShopifyProductCreatorError,
  createShopifyProductProposal,
} from "@/server/services/shopify-product-creator-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Protected by src/proxy.ts. This endpoint stores a proposal only; it never writes Shopify. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  try {
    const result = await createShopifyProductProposal(body);
    return NextResponse.json({ data: result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Dati prodotto non validi." }, { status: 400 });
    if (error instanceof ShopifyProductCreatorError) {
      const status = error.code === "DATABASE_NOT_CONFIGURED" ? 503 : error.code === "AI_OUTPUT_INVALID" || error.code === "PROPOSAL_INVALID" ? 422 : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof OpenAiConfigurationError) return NextResponse.json({ error: "OpenAI non e configurato." }, { status: 503 });
    if (error instanceof OpenAiRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "RATE_LIMITED" ? 429 : 502 });
    if (error instanceof ShopifyConfigurationError) return NextResponse.json({ error: "Shopify non e configurato." }, { status: 409 });
    if (error instanceof ShopifyAuthenticationError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof ShopifyApiError) return NextResponse.json({ error: error.message }, { status: error.status === 429 ? 429 : 502 });
    return NextResponse.json({ error: "Impossibile preparare la proposta prodotto." }, { status: 500 });
  }
}
