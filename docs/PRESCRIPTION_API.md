# Prescription API

Phase 8 implements FR-PRESCRIPTION-001 through FR-PRESCRIPTION-007 in `src/app/module/prescription`.

## Rules and lifecycle

- Only the assigned active doctor can create a prescription, and the appointment must be `COMPLETED`.
- The appointment relation is immutable and uniquely enforces one prescription per appointment.
- The doctor's administrator-issued registration number is used as the verified license identity.
- Instructions contain 10–5000 characters. Structured medicines are optional and support name, dosage, frequency, duration, and additional instructions.
- Follow-up dates must be future dates no more than six months from prescription creation.
- The issuing doctor may update within 30 days. Administrators may override afterward only with a reason; administrators cannot create prescriptions.
- Each update creates an immutable snapshot containing instructions, follow-up date, medicines, actor, reason, version number, and generated document metadata.
- A daily job sends follow-up reminders seven days before the follow-up date.

## Endpoints

| Method and path                                                          | Access                                | Purpose                                                                |
| ------------------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/v1/prescriptions`                                             | Assigned doctor                       | Create for a completed appointment and email PDF copies                |
| `PATCH /api/v1/prescriptions/:prescriptionId`                            | Issuing doctor or admin override      | Partial update and new immutable version/PDF                           |
| `GET /api/v1/prescriptions/:prescriptionId`                              | Owning patient, issuing doctor, admin | Full record, related data, history, signed PDF URL                     |
| `GET /api/v1/prescriptions/:prescriptionId/pdf`                          | Same ownership policy                 | Generate/reuse current PDF and return a 24-hour private URL            |
| `GET /api/v1/prescriptions/patient/:patientId`                           | Owner, issuing doctor, admin          | Paginated history, filtering, searching, and sorting                   |
| `GET /api/v1/prescriptions/doctor/:doctorId/statistics`                  | Same doctor or admin                  | Overview, 12-month/day/hour trends, follow-up analytics                |
| `GET /api/v1/prescriptions/admin/dashboard`                              | Admin and super-admin                 | System totals, growth, and top-doctor performance                      |
| `GET /api/v1/prescriptions/:prescriptionId/verify?token=...&version=...` | Public signed-token verification      | Verify any immutable PDF version without exposing patient medical data |

Patient-list filters include `doctorId`, `specialty`, `startDate`, `endDate`, and instruction `search`. Sorting supports `createdAt`, `followUpDate`, and `doctorName`, with a maximum page size of 50.

## PDF security and retention

Every professional PDF includes clinic identity, unique prescription number, version and timestamp, doctor/license/specialty, patient age, service date, medicine and general instructions, follow-up date, a visible digital-signature statement, authenticity watermark, and a high-error-correction QR verification URL.

PDFs are checksummed and stored under version-specific private object keys. The current version is cached rather than regenerated, signed downloads expire after 24 hours, and prescription records/documents have a seven-year retention date. Old version records and PDFs remain immutable for medical audit history.
