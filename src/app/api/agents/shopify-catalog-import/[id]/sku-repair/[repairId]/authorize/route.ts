import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeSkuRepair } from "@/server/services/shopify-catalog-sku-repair-service";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ repairId: string }> }) { try { const { repairId } = await context.params; return NextResponse.json({ data: await authorizeSkuRepair(z.string().cuid().parse(repairId)) }); } catch { return NextResponse.json({ error: "Approvazione riparazione SKU non disponibile." }, { status: 409 }); } }
