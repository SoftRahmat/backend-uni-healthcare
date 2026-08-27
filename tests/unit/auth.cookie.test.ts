import type { Request } from "express";
import { describe, expect, it } from "vitest";

import {
  AUTH_COOKIE_MAX_AGE_MS,
  AUTH_COOKIE_NAME,
  authCookieOptions,
  readAuthCookie,
} from "../../src/app/module/auth/auth-cookie.js";

describe("authentication cookie", () => {
  it("uses inaccessible same-site browser defaults", () => {
    expect(AUTH_COOKIE_NAME).toBe("ph_access_token");
    expect(authCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });
  });

  it("reads the encoded authentication cookie without a parsing dependency", () => {
    const request = {
      header: (name: string) =>
        name === "cookie" ? `theme=light; ${AUTH_COOKIE_NAME}=signed%2Etoken` : undefined,
    } as Request;

    expect(readAuthCookie(request)).toBe("signed.token");
  });
});
