import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeNextSkuRepair } from "@/server/services/shopify-catalog-sku-repair-service";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ repairId: string }> }) { try { const { repairId } = await context.params; return NextResponse.json({ data: await analyzeNextSkuRepair(z.string().cuid().parse(repairId)) }); } catch { return NextResponse.json({ error: "Impossibile analizzare la riparazione SKU." }, { status: 409 }); } }
