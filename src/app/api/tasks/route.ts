import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDatabaseConfigured } from "@/server/db";
import { createTaskSchema } from "@/server/domain/task-engine";
import { createPersistedTask, listPersistedTasks } from "@/server/services/task-service";

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ data: [], databaseConfigured: false });
  try {
    return NextResponse.json({ data: await listPersistedTasks(), databaseConfigured: true });
  } catch {
    return NextResponse.json({ error: "Impossibile recuperare le task." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido." }, { status: 400 });
  }
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Dati task non validi.", details: parsed.error.issues },
      { status: 400 },
    );
  if (!isDatabaseConfigured())
    return NextResponse.json({ error: "Database non configurato." }, { status: 503 });
  try {
    return NextResponse.json({ data: await createPersistedTask(parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "Dati task non validi.", details: error.issues },
        { status: 400 },
      );
    return NextResponse.json({ error: "Impossibile creare la task." }, { status: 500 });
  }
}
