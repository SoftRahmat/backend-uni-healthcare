import { describe, expect, it } from "vitest";

import {
  MEDICAL_REPORT_MAX_BYTES,
  MEDICAL_REPORT_MIME_TYPES,
} from "../../src/app/module/medicalReport/medicalReport-upload.middleware.js";
import { SignatureMedicalReportScanner } from "../../src/app/module/medicalReport/medicalReport-scanner.service.js";
import { PATIENT_REPORT_STORAGE_GRACE_DAYS } from "../../src/app/module/medicalReport/medicalReport-cleanup.service.js";

const file = (buffer: Buffer, mimetype = "application/pdf") => ({
  fieldname: "file",
  originalname: "report.pdf",
  encoding: "7bit",
  mimetype,
  size: buffer.length,
  buffer,
  destination: "",
  filename: "",
  path: "",
  stream: undefined as never,
});

describe("Phase 4 upload security", () => {
  const scanner = new SignatureMedicalReportScanner();

  it("limits reports to 10 MB and permits only the required MIME types", () => {
    expect(MEDICAL_REPORT_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(MEDICAL_REPORT_MIME_TYPES).toEqual(["application/pdf", "image/jpeg", "image/png"]);
    expect(PATIENT_REPORT_STORAGE_GRACE_DAYS).toBe(90);
  });

  it("accepts a matching PDF signature", async () => {
    await expect(
      scanner.assertSafe(file(Buffer.from("%PDF-1.7\ncontent"))),
    ).resolves.toBeUndefined();
  });

  it("rejects the EICAR test signature with HTTP 422", async () => {
    const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    await expect(scanner.assertSafe(file(Buffer.from(`%PDF-${eicar}`)))).rejects.toMatchObject({
      statusCode: 422,
      code: "MALWARE_DETECTED",
    });
  });

  it("rejects content that does not match the declared MIME type", async () => {
    await expect(scanner.assertSafe(file(Buffer.from("not a pdf")))).rejects.toMatchObject({
      statusCode: 400,
      code: "FILE_SIGNATURE_MISMATCH",
    });
  });
});
