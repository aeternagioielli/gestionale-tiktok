import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/server/auth";
import { proxy } from "@/proxy";

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

describe("AETERNA auth proxy", () => {
  it("redirects pages and rejects APIs without a session", async () => {
    process.env.AETERNA_AUTH_USERNAME = "test-user";
    process.env.AETERNA_AUTH_PASSWORD = "test-password";
    process.env.AETERNA_SESSION_SECRET = "test-session-secret";

    const pageResponse = await proxy(new NextRequest("http://localhost/orders"));
    const apiResponse = await proxy(new NextRequest("http://localhost/api/overview"));
    const openAiTestResponse = await proxy(
      new NextRequest("http://localhost/api/integrations/openai/test"),
    );

    expect(pageResponse.status).toBe(307);
    expect(pageResponse.headers.get("location")).toContain("/login?next=%2Forders");
    expect(apiResponse.status).toBe(401);
    expect(openAiTestResponse.status).toBe(401);
    expect(apiResponse.headers.get("www-authenticate")).toBeNull();
    expect(await apiResponse.json()).toEqual({ error: "Autenticazione richiesta." });
  });

  it("accepts a persistent signed session without Basic Auth", async () => {
    process.env.AETERNA_AUTH_USERNAME = "test-user";
    process.env.AETERNA_AUTH_PASSWORD = "test-password";
    process.env.AETERNA_SESSION_SECRET = "test-session-secret";
    const token = await createSessionToken();
    const sessionResponse = await proxy(
      new NextRequest("http://localhost/orders", {
        headers: { cookie: `aeterna_session=${token}` },
      }),
    );

    expect(sessionResponse.status).toBe(200);
  });
});
