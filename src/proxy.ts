import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  isAuthConfigured,
  setSessionCookie,
  verifySessionToken,
} from "@/server/auth";

function unauthorized() {
  return new NextResponse("Autenticazione richiesta.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AETERNA OS", charset="UTF-8"' },
  });
}

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/api/auth/");
}

export async function proxy(request: NextRequest) {
  const username = process.env.AETERNA_AUTH_USERNAME;
  const password = process.env.AETERNA_AUTH_PASSWORD;
  const isProduction = process.env.NODE_ENV === "production";
  const pathname = request.nextUrl.pathname;

  if (!username || !password) {
    return isProduction
      ? new NextResponse("Autenticazione non configurata.", { status: 503 })
      : NextResponse.next();
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  if (
    isAuthConfigured() &&
    (await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value))
  ) {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Basic ")) {
    const encoded = authorization.slice("Basic ".length);
    let decoded: string;
    try {
      decoded = atob(encoded);
    } catch {
      decoded = "";
    }
    const separator = decoded.indexOf(":");
    if (
      separator >= 0 &&
      decoded.slice(0, separator) === username &&
      decoded.slice(separator + 1) === password
    ) {
      const response = NextResponse.next();
      const token = await createSessionToken();
      if (token) setSessionCookie(response, token);
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("X-Frame-Options", "DENY");
      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      return response;
    }
  }

  if (pathname.startsWith("/api/")) return unauthorized();
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest).*)"],
};
