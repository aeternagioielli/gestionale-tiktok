import { NextResponse } from "next/server";
import { z } from "zod";
import { agentIdSchema } from "@/server/domain/agent-task-workflow";
import { createAgentTask, listAgentTasks } from "@/server/services/agent-task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ agent: agentIdSchema.optional(), limit: z.coerce.number().int().min(1).max(100).optional() });

export async function GET(request: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ tasks: await listAgentTasks(query) });
  } catch {
    return NextResponse.json({ error: "Impossibile leggere le attivita operative." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const task = await createAgentTask(await request.json());
    return NextResponse.json(task, { status: task.created ? 201 : 200 });
  } catch {
    return NextResponse.json({ error: "Impossibile creare l'attivita operativa." }, { status: 400 });
  }
}
