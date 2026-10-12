import { NextResponse } from "next/server";
import { getDailyLorenzoPlan, persistDailyLorenzoPlan } from "@/server/services/lorenzo-daily-cycle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getDailyLorenzoPlan());
}

// This endpoint is intentionally explicit: it records proposals, but never starts an autonomous cycle or external action.
export async function POST() {
  try {
    return NextResponse.json(await persistDailyLorenzoPlan(), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Impossibile registrare il piano operativo di Lorenzo." }, { status: 503 });
  }
}
