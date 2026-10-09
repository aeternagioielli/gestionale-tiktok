import type { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "aeterna_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type AuthConfig = {
  username: string;
  password: string;
  secret: string;
};

function getAuthConfig(): AuthConfig | null {
  const username = process.env.AETERNA_AUTH_USERNAME;
  const password = process.env.AETERNA_AUTH_PASSWORD;
  const configuredSecret = process.env.AETERNA_SESSION_SECRET;

  if (!username || !password) return null;
  if (configuredSecret) return { username, password, secret: configuredSecret };
  if (process.env.NODE_ENV !== "production") {
    return { username, password, secret: `development:${username}:${password}` };
  }
  return null;
}

export function isAuthConfigured(): boolean {
  return getAuthConfig() !== null;
}

export function credentialsMatch(username: string, password: string): boolean {
  const config = getAuthConfig();
  return Boolean(config && username === config.username && password === config.password);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

async function verifySignature(value: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64Url(signature) as BufferSource,
    new TextEncoder().encode(value),
  );
}

export async function createSessionToken(now = Date.now()): Promise<string | null> {
  const config = getAuthConfig();
  if (!config) return null;
  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${await sign(payload, config.secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  const config = getAuthConfig();
  if (!config || !token) return false;
  const separator = token.indexOf(".");
  if (separator <= 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiresAt = Number(payload);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  try {
    return await verifySignature(payload, signature, config.secret);
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
