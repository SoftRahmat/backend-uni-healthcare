import { describe, expect, it } from "vitest";

import { passwordSchema } from "../../src/app/module/auth/auth.validation.js";
import {
  createOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
  verifyAccessToken,
} from "../../src/app/utils/auth-token.js";
import { hashPassword, isPasswordReused, verifyPassword } from "../../src/app/utils/password.js";

describe("authentication security primitives", () => {
  it("creates at least 32 cryptographically random bytes and only persists a deterministic hash", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(first).toHaveLength(64);
    expect(second).toHaveLength(64);
    expect(first).not.toBe(second);
    expect(hashOpaqueToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOpaqueToken(first)).not.toContain(first);
  });

  it("signs the required user, session, email, and role access-token claims", async () => {
    const claims = {
      userId: "user-1",
      sessionId: "session-1",
      email: "patient@example.com",
      role: "PATIENT" as const,
    };
    const token = await signAccessToken(claims);
    const [header, payload, signature = ""] = token.split(".");
    const tamperedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;

    await expect(verifyAccessToken(token)).resolves.toEqual(claims);
    await expect(verifyAccessToken(`${header}.${payload}.${tamperedSignature}`)).rejects.toThrow();
  });

  it("uses bcrypt hashes and detects password reuse", async () => {
    const hash = await hashPassword("Strong!Password1");

    expect(hash).toMatch(/^\$2[aby]\$/);
    await expect(verifyPassword("Strong!Password1", hash)).resolves.toBe(true);
    await expect(verifyPassword("Wrong!Password1", hash)).resolves.toBe(false);
    await expect(isPasswordReused("Strong!Password1", [hash])).resolves.toBe(true);
  });

  it.each([
    "short",
    "alllowercase1!",
    "ALLUPPERCASE1!",
    "MissingNumber!",
    "MissingSpecial1",
  ])("rejects weak password %s", (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });
});
