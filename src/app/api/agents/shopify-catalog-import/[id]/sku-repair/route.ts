import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareSkuRepair } from "@/server/services/shopify-catalog-sku-repair-service";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json({ data: await prepareSkuRepair(z.string().cuid().parse(id)) }, { status: 201 }); }
  catch { return NextResponse.json({ error: "Impossibile preparare la riparazione SKU." }, { status: 409 }); }
}
