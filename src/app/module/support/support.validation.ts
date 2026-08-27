import { z } from "zod";

export const supportTicketSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase().max(320),
  category: z.enum([
    "ACCOUNT",
    "APPOINTMENT",
    "PAYMENT",
    "PRESCRIPTION",
    "PRIVACY",
    "TECHNICAL",
    "OTHER",
  ]),
  subject: z.string().trim().min(5).max(160),
  message: z.string().trim().min(20).max(5000),
  locale: z.enum(["en", "bn", "ms", "es", "pt"]).default("en"),
});

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
