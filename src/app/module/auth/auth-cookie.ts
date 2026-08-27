import type { CookieOptions, Request } from "express";

import { env } from "../../config/env.js";

export const AUTH_COOKIE_NAME = "ph_access_token";
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export const authCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
  path: "/",
});

export const authCookieClearOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
});

export const readAuthCookie = (request: Request): string | undefined => {
  const header = request.header("cookie");
  if (!header) return undefined;

  const encoded = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))
    ?.slice(AUTH_COOKIE_NAME.length + 1);
  if (!encoded) return undefined;

  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
};
