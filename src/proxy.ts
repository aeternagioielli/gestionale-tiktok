import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function unauthorized() {
  return new NextResponse("Autenticazione richiesta.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AETERNA OS", charset="UTF-8"' },
  });
}

export function proxy(request: NextRequest) {
  const username = process.env.AETERNA_AUTH_USERNAME;
  const password = process.env.AETERNA_AUTH_PASSWORD;
  const isProduction = process.env.NODE_ENV === "production";

  if (!username || !password) {
    return isProduction
      ? new NextResponse("Autenticazione non configurata.", { status: 503 })
      : NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();
  const encoded = authorization.slice("Basic ".length);
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }
  const separator = decoded.indexOf(":");
  if (
    separator < 0 ||
    decoded.slice(0, separator) !== username ||
    decoded.slice(separator + 1) !== password
  )
    return unauthorized();

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest).*)"],
};
