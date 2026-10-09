import { afterEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as session } from "@/app/api/auth/session/route";

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

describe("authentication routes", () => {
  it("sets a persistent cookie and recognizes the session", async () => {
    process.env.AETERNA_AUTH_USERNAME = "test-user";
    process.env.AETERNA_AUTH_PASSWORD = "test-password";
    process.env.AETERNA_SESSION_SECRET = "test-session-secret";

    const loginResponse = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "test-user", password: "test-password" }),
      }),
    );
    const setCookie = loginResponse.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0];
    const sessionResponse = await session(
      new Request("http://localhost/api/auth/session", {
        headers: { cookie },
      }),
    );

    expect(loginResponse.status).toBe(200);
    expect(setCookie).toContain("aeterna_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Max-Age=2592000");
    expect((await sessionResponse.json()).authenticated).toBe(true);
  });

  it("rejects wrong credentials and clears the cookie on logout", async () => {
    process.env.AETERNA_AUTH_USERNAME = "test-user";
    process.env.AETERNA_AUTH_PASSWORD = "test-password";
    process.env.AETERNA_SESSION_SECRET = "test-session-secret";

    const invalidResponse = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "test-user", password: "wrong" }),
      }),
    );
    const logoutResponse = await logout();
    const setCookie = logoutResponse.headers.get("set-cookie") ?? "";

    expect(invalidResponse.status).toBe(401);
    expect(logoutResponse.status).toBe(200);
    expect(setCookie).toContain("aeterna_session=");
    expect(setCookie).toContain("Max-Age=0");
  });
});
