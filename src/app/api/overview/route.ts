import { NextResponse } from "next/server";
import { DomainError } from "@/server/domain/errors";
import { emptyOverviewData, getOverviewData } from "@/server/services/overview-service";

export async function GET() {
  try {
    return NextResponse.json(await getOverviewData());
  } catch (error) {
    if (error instanceof DomainError && error.code === "DATABASE_NOT_CONFIGURED")
      return NextResponse.json(emptyOverviewData());
    return NextResponse.json({ error: "Impossibile recuperare la panoramica." }, { status: 503 });
  }
}
