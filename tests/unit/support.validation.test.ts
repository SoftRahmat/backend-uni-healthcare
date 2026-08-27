import { describe, expect, it } from "vitest";

import { supportTicketSchema } from "../../src/app/module/support/support.validation.js";

describe("supportTicketSchema", () => {
  it("normalizes a valid support request", () => {
    const result = supportTicketSchema.parse({
      name: "  Patient Name  ",
      email: "PATIENT@EXAMPLE.COM",
      category: "APPOINTMENT",
      subject: "  Booking assistance  ",
      message: "  I need help changing an upcoming appointment.  ",
      locale: "bn",
    });

    expect(result).toEqual({
      name: "Patient Name",
      email: "patient@example.com",
      category: "APPOINTMENT",
      subject: "Booking assistance",
      message: "I need help changing an upcoming appointment.",
      locale: "bn",
    });
  });

  it("rejects incomplete and unsupported requests", () => {
    expect(() =>
      supportTicketSchema.parse({
        name: "A",
        email: "not-an-email",
        category: "EMERGENCY",
        subject: "Help",
        message: "Too short",
      }),
    ).toThrow();
  });
});
