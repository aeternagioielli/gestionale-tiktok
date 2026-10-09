import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/server/db";
import { ensureDefaultGoalStructure, listGoals } from "@/server/services/goal-service";

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ data: [], databaseConfigured: false });
  try {
    return NextResponse.json({ data: await listGoals(), databaseConfigured: true });
  } catch {
    return NextResponse.json({ error: "Impossibile recuperare gli obiettivi." }, { status: 503 });
  }
}

export async function POST() {
  if (!isDatabaseConfigured())
    return NextResponse.json({ error: "Database non configurato." }, { status: 503 });
  try {
    return NextResponse.json({ data: await ensureDefaultGoalStructure() }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Impossibile inizializzare l'obiettivo." }, { status: 500 });
  }
}
