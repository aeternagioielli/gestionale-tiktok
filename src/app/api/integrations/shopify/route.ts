import { NextResponse } from "next/server";
import { ShopifyApiError, ShopifyConfigurationError } from "@/integrations/shopify/shopify.adapter";
import { isDatabaseConfigured } from "@/server/db";
import {
  checkShopifyConnection,
  getShopifyIntegrationStatus,
  syncShopify,
} from "@/server/services/shopify-sync-service";

export async function GET() {
  try {
    const status = await checkShopifyConnection();
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof ShopifyConfigurationError)
      return NextResponse.json(await getShopifyIntegrationStatus());
    if (error instanceof ShopifyApiError) {
      return NextResponse.json(
        { ...(await getShopifyIntegrationStatus()), error: error.message },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json(
      { error: "Impossibile recuperare lo stato di Shopify." },
      { status: 503 },
    );
  }
}

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database non configurato." }, { status: 503 });
  }
  try {
    const result = await syncShopify();
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof ShopifyConfigurationError) {
      return NextResponse.json(
        { error: "Shopify non è configurato. Imposta le variabili ambiente locali richieste." },
        { status: 409 },
      );
    }
    if (error instanceof ShopifyApiError) {
      return NextResponse.json(
        { error: error.message, retryAfterSeconds: error.retryAfterSeconds ?? null },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json({ error: "Sincronizzazione Shopify non riuscita." }, { status: 500 });
  }
}
