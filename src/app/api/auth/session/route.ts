import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/server/auth";

export async function GET(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  return NextResponse.json(
    { authenticated: await verifySessionToken(token) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
