import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/server/db";
import { getGoalById } from "@/server/services/goal-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id)
    return NextResponse.json({ error: "Identificativo obiettivo mancante." }, { status: 400 });
  if (!isDatabaseConfigured())
    return NextResponse.json({ error: "Database non configurato." }, { status: 503 });
  try {
    const goal = await getGoalById(id);
    return goal
      ? NextResponse.json({ data: goal })
      : NextResponse.json({ error: "Obiettivo non trovato." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Impossibile recuperare l'obiettivo." }, { status: 503 });
  }
}
