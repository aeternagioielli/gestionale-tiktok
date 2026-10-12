import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ShopifyCatalogImportError,
  reconcileNextAeternaCatalogItem,
} from "@/server/services/shopify-catalog-import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Performs one read-only reconciliation step for an uncertain prior write. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ data: await reconcileNextAeternaCatalogItem(z.string().cuid().parse(id)) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Identificativo importazione non valido." }, { status: 400 });
    if (error instanceof ShopifyCatalogImportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "IMPORT_NOT_FOUND" ? 404 : error.code === "DATABASE_NOT_CONFIGURED" ? 503 : 409 },
      );
    }
    return NextResponse.json({ error: "Impossibile verificare le bozze Shopify." }, { status: 502 });
  }
}
