import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { env } from "../config/env.js";

const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

export type AccessTokenClaims = {
  userId: string;
  sessionId: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "DOCTOR" | "PATIENT";
};

export const createOpaqueToken = (): string => randomBytes(32).toString("hex");

export const hashOpaqueToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const signAccessToken = async (claims: AccessTokenClaims): Promise<string> =>
  new SignJWT({
    sid: claims.sessionId,
    email: claims.email,
    role: claims.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret);

export const verifyAccessToken = async (token: string): Promise<AccessTokenClaims> => {
  const { payload } = await jwtVerify(token, jwtSecret, { algorithms: ["HS256"] });

  if (
    !payload.sub ||
    typeof payload.sid !== "string" ||
    typeof payload.email !== "string" ||
    !["SUPER_ADMIN", "ADMIN", "DOCTOR", "PATIENT"].includes(String(payload.role))
  ) {
    throw new Error("Access token claims are invalid");
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    email: payload.email,
    role: payload.role as AccessTokenClaims["role"],
  };
};
