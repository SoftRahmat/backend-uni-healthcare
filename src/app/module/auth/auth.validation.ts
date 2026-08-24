import { z } from "zod";

// Request contracts owned by the authentication module.

export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(320),
  password: passwordSchema,
  contactNumber: z.string().trim().min(5).max(30).optional(),
  address: z.string().trim().max(500).optional(),
});

export const emailSchema = z.object({ email: z.email().max(320) });
export const tokenSchema = z.object({ token: z.string().min(64).max(256) });
export const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
});
export const resetPasswordSchema = tokenSchema.extend({ password: passwordSchema });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
  revokeOtherSessions: z.boolean().default(true),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
