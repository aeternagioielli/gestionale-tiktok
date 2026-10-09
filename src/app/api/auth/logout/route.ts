import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/auth";

export async function POST() {
  return clearSessionCookie(NextResponse.json({ authenticated: false }));
}
