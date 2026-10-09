import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, credentialsMatch, verifySessionToken } from "@/server/auth";

const originalUsername = process.env.AETERNA_AUTH_USERNAME;
const originalPassword = process.env.AETERNA_AUTH_PASSWORD;
const originalSecret = process.env.AETERNA_SESSION_SECRET;

afterEach(() => {
  if (originalUsername === undefined) delete process.env.AETERNA_AUTH_USERNAME;
  else process.env.AETERNA_AUTH_USERNAME = originalUsername;
  if (originalPassword === undefined) delete process.env.AETERNA_AUTH_PASSWORD;
  else process.env.AETERNA_AUTH_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete process.env.AETERNA_SESSION_SECRET;
  else process.env.AETERNA_SESSION_SECRET = originalSecret;
});

describe("signed AETERNA session", () => {
  it("creates a token that survives a later request", async () => {
    process.env.AETERNA_AUTH_USERNAME = "test-user";
    process.env.AETERNA_AUTH_PASSWORD = "test-password";
    process.env.AETERNA_SESSION_SECRET = "test-session-secret";

    const token = await createSessionToken(1_700_000_000_000);
    expect(token).toBeTruthy();
    expect(await verifySessionToken(token ?? undefined, 1_700_000_001_000)).toBe(true);
    expect(credentialsMatch("test-user", "test-password")).toBe(true);
  });

  it("rejects expired and altered sessions", async () => {
    process.env.AETERNA_AUTH_USERNAME = "test-user";
    process.env.AETERNA_AUTH_PASSWORD = "test-password";
    process.env.AETERNA_SESSION_SECRET = "test-session-secret";

    const token = await createSessionToken(1_700_000_000_000);
    expect(
      await verifySessionToken(token ?? undefined, 1_700_000_000_000 + 31 * 24 * 60 * 60 * 1000),
    ).toBe(false);
    expect(await verifySessionToken(`${token}x`, 1_700_000_001_000)).toBe(false);
    expect(credentialsMatch("test-user", "wrong-password")).toBe(false);
  });
});
