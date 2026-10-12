import { NextResponse } from "next/server";
import { transitionAgentTask } from "@/server/services/agent-task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const task = await transitionAgentTask({ taskId: id, status: body.status, actor: body.actor, result: body.result });
    return NextResponse.json({ task });
  } catch {
    return NextResponse.json({ error: "Impossibile aggiornare lo stato dell'attivita." }, { status: 400 });
  }
}
