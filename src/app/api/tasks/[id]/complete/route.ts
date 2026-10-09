import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/server/db";
import { DomainError } from "@/server/domain/errors";
import { completePersistedTask } from "@/server/services/task-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Identificativo task mancante." }, { status: 400 });
  if (!isDatabaseConfigured())
    return NextResponse.json({ error: "Database non configurato." }, { status: 503 });
  try {
    return NextResponse.json({ data: await completePersistedTask(id) });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === "TASK_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "Impossibile completare la task." }, { status: 500 });
  }
}
