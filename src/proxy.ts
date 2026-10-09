import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, isAuthConfigured, verifySessionToken } from "@/server/auth";

function unauthorized() {
  return NextResponse.json({ error: "Autenticazione richiesta." }, { status: 401 });
}

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/api/auth/");
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) return NextResponse.next();

  if (!isAuthConfigured()) {
    return process.env.NODE_ENV === "production"
      ? NextResponse.json({ error: "Autenticazione non configurata." }, { status: 503 })
      : NextResponse.next();
  }

  const sessionIsValid = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (sessionIsValid) return NextResponse.next();

  if (pathname.startsWith("/api/")) return unauthorized();
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest).*)"],
};
