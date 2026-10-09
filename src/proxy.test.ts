import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
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

    expect(pageResponse.status).toBe(307);
    expect(pageResponse.headers.get("location")).toContain("/login?next=%2Forders");
    expect(apiResponse.status).toBe(401);
  });

  it("exchanges legacy Basic Auth for a persistent signed session", async () => {
    process.env.AETERNA_AUTH_USERNAME = "test-user";
    process.env.AETERNA_AUTH_PASSWORD = "test-password";
    process.env.AETERNA_SESSION_SECRET = "test-session-secret";
    const basic = btoa("test-user:test-password");

    const bootstrapResponse = await proxy(
      new NextRequest("http://localhost/orders", {
        headers: { authorization: `Basic ${basic}` },
      }),
    );
    const setCookie = bootstrapResponse.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.split(";")[0];
    const sessionResponse = await proxy(
      new NextRequest("http://localhost/orders", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(bootstrapResponse.status).toBe(200);
    expect(setCookie).toContain("aeterna_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(sessionResponse.status).toBe(200);
  });
});
