import type { RequestHandler } from "express";
import multer from "multer";

import { ApiError } from "../../errorHelpers/ApiError.js";

export const MEDICAL_REPORT_MIME_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const);
export const MEDICAL_REPORT_MAX_BYTES = 10 * 1024 * 1024;

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDICAL_REPORT_MAX_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!MEDICAL_REPORT_MIME_TYPES.includes(file.mimetype as typeof MEDICAL_REPORT_MIME_TYPES[number])) {
      callback(new ApiError(400, "Only PDF, JPG, and PNG medical reports are allowed", "INVALID_FILE_TYPE"));
      return;
    }
    callback(null, true);
  },
});

export const uploadMedicalReportFile: RequestHandler = uploader.single("file");
