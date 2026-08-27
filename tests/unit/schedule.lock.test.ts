import type { Prisma } from "../../src/generated/prisma/client.js";
import { describe, expect, it, vi } from "vitest";

import { lockDoctorSchedules } from "../../src/app/module/schedule/schedule.service.js";

describe("schedule transaction locking", () => {
  it("executes the advisory lock without deserializing its void result", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const transaction = { $executeRaw: executeRaw } as unknown as Prisma.TransactionClient;

    await lockDoctorSchedules(transaction, "doctor-id");

    expect(executeRaw).toHaveBeenCalledOnce();
    expect(executeRaw.mock.calls[0]?.[1]).toBe("doctor-id");
  });
});
