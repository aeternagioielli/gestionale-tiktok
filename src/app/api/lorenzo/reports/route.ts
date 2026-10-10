import { NextResponse } from "next/server";
import { OpenAiConfigurationError, OpenAiRequestError } from "@/server/ai/openai-service";
import {
  generateLorenzoReport,
  getLorenzoWorkspace,
  LorenzoDataError,
  LorenzoOutputError,
} from "@/server/services/lorenzo-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let generationInProgress = false;

export async function GET() {
  const workspace = await getLorenzoWorkspace();
  if (!workspace.databaseConfigured)
    return NextResponse.json({ error: "Database non configurato." }, { status: 503 });
  if (!workspace.databaseAvailable)
    return NextResponse.json({ error: "Database non raggiungibile." }, { status: 503 });
  return NextResponse.json({ data: workspace });
}

export async function POST() {
  if (generationInProgress)
    return NextResponse.json(
      { error: "Un'analisi Lorenzo è già in corso. Attendi il completamento." },
      { status: 409 },
    );

  generationInProgress = true;
  try {
    const report = await generateLorenzoReport();
    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    if (error instanceof LorenzoDataError)
      return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof OpenAiConfigurationError)
      return NextResponse.json({ error: "OpenAI non è configurato." }, { status: 503 });
    if (error instanceof OpenAiRequestError)
      return NextResponse.json(
        { error: "L'analisi Lorenzo non è disponibile al momento.", code: error.code },
        { status: error.code === "RATE_LIMITED" ? 429 : 502 },
      );
    if (error instanceof LorenzoOutputError)
      return NextResponse.json(
        { error: "L'analisi ricevuta non è utilizzabile. Riprova più tardi." },
        { status: 502 },
      );
    return NextResponse.json({ error: "Impossibile generare l'analisi Lorenzo." }, { status: 500 });
  } finally {
    generationInProgress = false;
  }
}
