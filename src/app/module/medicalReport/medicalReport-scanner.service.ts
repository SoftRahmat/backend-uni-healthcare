import { ApiError } from "../../errorHelpers/ApiError.js";
import { env } from "../../config/env.js";

export interface MedicalReportScanner {
  assertSafe(file: Express.Multer.File): Promise<void>;
}

/** A deterministic local safety gate; production deployments can inject an AV-engine adapter. */
export class SignatureMedicalReportScanner implements MedicalReportScanner {
  async assertSafe(file: Express.Multer.File): Promise<void> {
    const eicarMarker = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    if (file.buffer.includes(Buffer.from(eicarMarker, "ascii"))) {
      throw new ApiError(422, "Medical report failed the malware scan", "MALWARE_DETECTED");
    }

    // Validate file magic in addition to the client-provided MIME header.
    const bytes = file.buffer;
    const pdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png =
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const signatureMatches =
      (file.mimetype === "application/pdf" && pdf) ||
      (file.mimetype === "image/jpeg" && jpeg) ||
      (file.mimetype === "image/png" && png);
    if (!signatureMatches) {
      throw new ApiError(
        400,
        "Medical report content does not match its file type",
        "FILE_SIGNATURE_MISMATCH",
      );
    }
  }
}

export class ConfiguredMedicalReportScanner implements MedicalReportScanner {
  constructor(private readonly signatures = new SignatureMedicalReportScanner()) {}

  async assertSafe(file: Express.Multer.File): Promise<void> {
    await this.signatures.assertSafe(file);
    if (!env.VIRUS_SCAN_URL) {
      if (env.NODE_ENV === "production") {
        throw new ApiError(503, "Malware scanner is unavailable", "MALWARE_SCANNER_UNAVAILABLE");
      }
      return;
    }

    let response: Response;
    try {
      response = await fetch(env.VIRUS_SCAN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.originalname),
          ...(env.VIRUS_SCAN_API_KEY ? { authorization: `Bearer ${env.VIRUS_SCAN_API_KEY}` } : {}),
        },
        body: new Uint8Array(file.buffer),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ApiError(503, "Malware scanner is unavailable", "MALWARE_SCANNER_UNAVAILABLE");
    }
    if (!response.ok) {
      throw new ApiError(503, "Malware scanner is unavailable", "MALWARE_SCANNER_UNAVAILABLE");
    }
    const verdict = (await response.json().catch(() => null)) as { safe?: unknown } | null;
    if (!verdict || typeof verdict.safe !== "boolean") {
      throw new ApiError(
        503,
        "Malware scanner returned an invalid verdict",
        "MALWARE_SCANNER_UNAVAILABLE",
      );
    }
    if (!verdict.safe) {
      throw new ApiError(422, "Medical report failed the malware scan", "MALWARE_DETECTED");
    }
  }
}
