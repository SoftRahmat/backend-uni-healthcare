# Patient and Medical Report API

Base path: `/api/v1/patients`

All endpoints require a valid bearer access token. Responses use the common `success`, `message`, `data`, and optional `meta` envelope.

## Patient endpoints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/` | SUPER_ADMIN, ADMIN | Paginated patients with status/date/search filters and per-patient statistics |
| GET | `/me` | PATIENT | Read the authenticated patient's profile, health data, recent reports, and risk indicators |
| PATCH | `/me` | PATIENT | Update owned profile fields; email and role are never accepted |
| GET | `/:patientId` | Owner, ADMIN/SUPER_ADMIN; assigned DOCTOR after Phase 6 | Read a patient profile |
| PATCH | `/:patientId` | Owner, ADMIN/SUPER_ADMIN | Update a profile; only admins may change account status |
| PUT | `/:patientId/health-data` | Patient owner only | Create or replace health data and recalculate BMI |

Patient list query defaults are `page=1`, `limit=10`, `sortBy=createdAt`, and `sortOrder=desc`; `limit` cannot exceed 100. Health data accepts ages 18–120, heights 50–250 cm, weights 20–300 kg, and computes BMI to two decimals. All medical-data reads and mutations are audited.

Doctor reads are currently denied with `PATIENT_ASSIGNMENT_REQUIRED`. Phase 6 will replace that conservative denial with an appointment-assignment lookup when the Appointment model exists.

## Medical report endpoints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/:patientId/medical-reports` | Patient owner only | Upload one `file` plus `reportName`, `reportType`, and optional `notes` |
| GET | `/:patientId/medical-reports` | Owner, ADMIN/SUPER_ADMIN; assigned DOCTOR after Phase 6 | List reports newest-first with one-hour signed links |
| GET | `/:patientId/medical-reports/:reportId/access` | Same as list | Issue a fresh one-hour signed download link |
| DELETE | `/:patientId/medical-reports/:reportId` | Owner, ADMIN/SUPER_ADMIN | Soft-delete metadata while preserving the seven-year retention record |

Uploads are route-scoped and memory-buffered only after authentication. The boundary allows PDF, JPEG, and PNG up to 10 MB, verifies MIME and file magic, rejects the EICAR malware-test signature, stores only metadata in PostgreSQL, and writes the object to a private S3-compatible bucket with server-side encryption. The API never exposes the internal object key or permanent `s3://` URL.

The configured scanner always performs local MIME/signature and EICAR checks, then calls `VIRUS_SCAN_URL` for an external verdict when configured. Production uploads fail closed with `MALWARE_SCANNER_UNAVAILABLE` if that service is absent or unhealthy. Storage failures do not create database metadata, and database failures trigger best-effort cleanup of the newly uploaded object.

## Storage configuration

Set `S3_REGION` and `S3_BUCKET`. Use the runtime's IAM/default credential provider where available, or set `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true` support compatible providers and local object stores. Production also requires `VIRUS_SCAN_URL`; `VIRUS_SCAN_API_KEY` is optional.

Objects use `medical-reports/{patientId}/{reportId}-{timestamp}.{extension}`. Report records carry a seven-year `retentionUntil` metadata value. A daily, batched cleanup removes private objects 90 days after patient account soft deletion and records `storageDeletedAt`; the retained metadata preserves the compliance audit history.

## Main errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`, `INVALID_FILE_TYPE`, `FILE_SIGNATURE_MISMATCH` | Invalid metadata or upload content |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid authentication |
| 403 | `FORBIDDEN`, `RESOURCE_ACCESS_DENIED`, `PATIENT_ASSIGNMENT_REQUIRED` | Role, ownership, or assignment denied |
| 404 | `PATIENT_NOT_FOUND`, `MEDICAL_REPORT_NOT_FOUND` | Resource does not exist or was soft-deleted |
| 409 | `REPORT_LIMIT_REACHED` | Patient already has 50 active reports |
| 413 | `FILE_TOO_LARGE` | Upload exceeds 10 MB |
| 422 | `MALWARE_DETECTED` | Malware scan rejected the file |
| 503 | `MALWARE_SCANNER_UNAVAILABLE` | Production antivirus service is missing or unhealthy |
