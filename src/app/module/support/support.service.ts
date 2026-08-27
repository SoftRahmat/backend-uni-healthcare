import type { RequestContext } from "../../interfaces/index.js";
import { prisma } from "../../lib/prisma.js";
import type { SupportTicketInput } from "./support.validation.js";

export type SupportTicketActor = { userId: string } | undefined;

export class SupportService {
  async createTicket(
    input: SupportTicketInput,
    actor: SupportTicketActor,
    context: RequestContext,
  ) {
    const ticket = await prisma.$transaction(async (transaction) => {
      const created = await transaction.supportTicket.create({
        data: {
          ...input,
          userId: actor?.userId,
        },
        select: { id: true, status: true, createdAt: true },
      });

      await transaction.auditLog.create({
        data: {
          action: "SUPPORT_TICKET_CREATED",
          userId: actor?.userId,
          ...context,
          metadata: {
            supportTicketId: created.id,
            category: input.category,
            authenticated: Boolean(actor),
          },
        },
      });

      return created;
    });

    return ticket;
  }
}

export const supportService = new SupportService();
