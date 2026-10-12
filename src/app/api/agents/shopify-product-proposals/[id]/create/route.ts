import { NextResponse } from "next/server";
import { z } from "zod";
import { ShopifyApiError, ShopifyAuthenticationError, ShopifyConfigurationError } from "@/integrations/shopify/shopify.adapter";
import {
  ShopifyProductCreatorError,
  createApprovedShopifyDraft,
} from "@/server/services/shopify-product-creator-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Protected by src/proxy.ts. This is the sole, explicit human-approved write path. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const task = await createApprovedShopifyDraft(z.string().cuid().parse(id));
    return NextResponse.json({ data: task });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Identificativo proposta non valido." }, { status: 400 });
    if (error instanceof ShopifyProductCreatorError) {
      const status = error.code === "DATABASE_NOT_CONFIGURED" ? 503
        : error.code === "PROPOSAL_NOT_FOUND" ? 404
          : error.code === "WRITE_SCOPE_MISSING" ? 403
            : error.code === "DUPLICATE_PRODUCT" ? 409
              : error.code === "WRITE_OUTCOME_UNKNOWN" ? 502 : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof ShopifyConfigurationError) return NextResponse.json({ error: "Shopify non e configurato." }, { status: 409 });
    if (error instanceof ShopifyAuthenticationError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof ShopifyApiError) return NextResponse.json({ error: error.message }, { status: error.status === 429 ? 429 : 502 });
    return NextResponse.json({ error: "Creazione bozza Shopify non riuscita." }, { status: 500 });
  }
}
