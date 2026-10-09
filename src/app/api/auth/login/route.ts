import { NextResponse } from "next/server";
import { credentialsMatch, createSessionToken, setSessionCookie } from "@/server/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("username" in body) ||
    !("password" in body) ||
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    body.username.length > 256 ||
    body.password.length > 1024
  ) {
    return NextResponse.json({ error: "Credenziali non valide." }, { status: 400 });
  }
  if (!credentialsMatch(body.username, body.password)) {
    return NextResponse.json({ error: "Credenziali non valide." }, { status: 401 });
  }
  const token = await createSessionToken();
  if (!token)
    return NextResponse.json({ error: "Autenticazione non configurata." }, { status: 503 });
  const response = NextResponse.json({ authenticated: true });
  return setSessionCookie(response, token);
}
