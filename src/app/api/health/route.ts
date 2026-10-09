import { NextResponse } from "next/server";
import { checkDatabaseConnection, isDatabaseConfigured } from "@/server/db";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      status: "ok",
      database: "not_configured",
    });
  }

  const connected = await checkDatabaseConnection();

  return NextResponse.json(
    {
      status: connected ? "ok" : "error",
      database: connected ? "connected" : "unavailable",
    },
    { status: connected ? 200 : 503 },
  );
}
