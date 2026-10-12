import { NextResponse } from "next/server";
import {
  ShopifyCatalogImportError,
  prepareAeternaCatalogImport,
} from "@/server/services/shopify-catalog-import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Protected by src/proxy.ts. This prepares tasks only; it never calls Shopify. */
export async function POST() {
  try {
    return NextResponse.json({ data: await prepareAeternaCatalogImport() }, { status: 201 });
  } catch (error) {
    if (error instanceof ShopifyCatalogImportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "DATABASE_NOT_CONFIGURED" ? 503 : 409 },
      );
    }
    return NextResponse.json({ error: "Impossibile preparare l'importazione catalogo." }, { status: 500 });
  }
}
