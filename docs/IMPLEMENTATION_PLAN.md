# PH-HealthCare Backend Implementation Plan

Last updated: 2026-08-24

## Source of truth

- Product requirements: `docs/PH-HealthCare-Backend-Project-Requirements.md`
- This roadmap controls implementation order and delivery gates.
- Requirement wording and acceptance criteria take precedence over this roadmap if they conflict.
- Each phase must finish with passing build, lint, automated tests, and a requirement-coverage update before the next phase starts.

## Delivery principles

1. Implement vertical slices: schema, service, API, authorization, tests, and documentation are delivered together.
2. Keep controllers thin and place business rules in services; repositories own persistence queries.
3. Validate every external input with Zod and return the standard response envelope.
4. Use database transactions for multi-entity writes and soft deletion for recoverable business data.
5. Add audit events for security, medical, administrative, and financial mutations.
6. Never expose secrets, password hashes, internal session data, or unauthorized medical data.
7. Every requirement ID must be covered by at least one automated test or an explicitly documented manual/integration check.
8. Every domain must use `src/app/module/<domain>/` and own its controller, service, routes, validation, and domain-specific helpers; shared infrastructure must follow `docs/ARCHITECTURE.md`.

## Phase status

| Phase | Scope | Requirement coverage | Status |
| --- | --- | --- | --- |
| 0 | Engineering foundation | Cross-cutting prerequisites | Complete |
| 1 | Authentication and sessions | FR-AUTH-001 through FR-AUTH-007 | In progress |
| 2 | RBAC and admin management | FR-RBAC-001 through FR-RBAC-003; FR-ADMIN-001 through FR-ADMIN-003 | In progress |
| 3 | Doctor and specialty management | FR-DOCTOR-001 through FR-DOCTOR-005; FR-SPECIALTY-001 through FR-SPECIALTY-004 | In progress |
| 4 | Patient profiles and medical reports | FR-PATIENT-001 through FR-PATIENT-005 | Pending |
| 5 | Doctor schedules | FR-SCHEDULE-001 through FR-SCHEDULE-004 | Pending |
| 6 | Appointment lifecycle | FR-APPOINTMENT-001 through FR-APPOINTMENT-007 | Pending |
| 7 | Stripe payments and invoicing | FR-PAYMENT-001 through FR-PAYMENT-007 | Pending |
| 8 | Prescriptions | FR-PRESCRIPTION-001 through FR-PRESCRIPTION-007 | Pending |
| 9 | Reviews and ratings | FR-REVIEW-001 through FR-REVIEW-007 | Pending |
| 10 | Production hardening and release | All NFR-PERF, NFR-SEC, NFR-REL, NFR-MAIN, NFR-USE, and NFR-COMP requirements | Pending |

## Phase 0 - Engineering foundation

### Deliverables

- Establish the layered source structure: config, routes, controllers, services, repositories, middleware, shared errors, and utilities.
- Validate runtime configuration at startup and maintain a complete `.env.example` without secrets.
- Remove database mutation from the root route and expose a side-effect-free liveness endpoint.
- Add the versioned `/api/v1` route boundary.
- Implement request IDs, structured logging, JSON size limits, security headers, CORS policy, and baseline rate limiting.
- Implement standard success/error envelopes, 404 handling, async error forwarding, and graceful shutdown.
- Add unit/integration test infrastructure and initial application-shell tests.
- Add build, lint, type-check, and test scripts suitable for CI.

### Exit gate

- Application starts only with valid configuration.
- Health endpoint succeeds without requiring a database write.
- Unknown routes use the standard 404 error response.
- Oversized/invalid JSON and unhandled errors use sanitized standard responses.
- Build, lint, and tests pass.

## Phase 1 - Authentication and session security

### Deliverables

- Add User, Patient identity shell, session, verification-token, reset-token, password-history, and login-attempt persistence.
- Add a database-aware readiness endpoint once identity persistence is available.
- Integrate Better Auth while retaining the requirements' JWT/session behavior and revocation rules.
- Implement registration, email verification/resend, login, password reset, password change, logout/logout-all, and session listing/termination.
- Add bcrypt password hashing, password complexity/history checks, token hashing, account status enforcement, lockout, and rate limits.
- Add email adapter and templates for verification, reset, password-change, and security notifications.
- Record authentication audit events without logging secrets or raw tokens.

### Exit gate

- FR-AUTH-001 through FR-AUTH-007 acceptance criteria are mapped to passing tests.
- Token expiration, one-time use, resend throttling, lockout, session limits, and revocation are verified.
- Authentication endpoints are documented with request/response/error examples.

## Phase 2 - RBAC and admin management

### Deliverables

- Add role hierarchy, reusable authentication/authorization middleware, account-status checks, and ownership policies.
- Implement Admin profile creation, updates, pagination, filtering, sorting, and soft-delete visibility rules.
- Enforce SUPER_ADMIN-only admin creation and privilege boundaries.
- Add resource-policy tests for all role matrix combinations and cross-user access attempts.

### Exit gate

- FR-RBAC-001 through FR-RBAC-003 and FR-ADMIN-001 through FR-ADMIN-003 pass their authorization and data-sanitization tests.

## Phase 3 - Doctor and specialty management

### Deliverables

- Add Doctor, Specialty, and DoctorSpecialty schemas, indexes, constraints, and soft-delete behavior.
- Implement doctor creation, update, listing, detail, deletion, credential validation, fee storage, ratings fields, and welcome flow.
- Implement specialty create, update, list, and delete with duplicate and in-use checks.
- Add filtered/sorted doctor discovery and cache contracts with invalidation hooks.

### Exit gate

- FR-DOCTOR-001 through FR-DOCTOR-005 and FR-SPECIALTY-001 through FR-SPECIALTY-004 pass.
- Doctor search, immutable fields, specialty assignment, soft deletion, and sensitive-data exclusion are verified.

## Phase 4 - Patient profiles and medical reports

### Deliverables

- Complete Patient, patient health data, MedicalReport, and document metadata schemas.
- Implement self-service patient updates and restricted administrative patient listing/detail.
- Enforce field ownership rules for demographics versus health data.
- Add an S3-compatible storage adapter, MIME/size validation, private object access, and metadata persistence.
- Implement upload, listing, access authorization, and soft deletion for medical reports.

### Exit gate

- FR-PATIENT-001 through FR-PATIENT-005 pass, including medical-data privacy and upload-security tests.

## Phase 5 - Doctor schedules

### Deliverables

- Add Schedule and DoctorSchedule persistence with uniqueness and overlap constraints.
- Implement schedule create, read, update, and delete operations with doctor/admin ownership rules.
- Prevent overlapping slots, invalid time ranges, and unsafe changes to booked schedules.
- Add availability caching and invalidation.

### Exit gate

- FR-SCHEDULE-001 through FR-SCHEDULE-004 pass, including timezone, overlap, ownership, and booked-slot scenarios.

## Phase 6 - Appointment lifecycle

### Deliverables

- Add Appointment persistence, statuses, immutable pricing snapshot, cancellation metadata, and lifecycle audit events.
- Implement booking with transactional slot locking to prevent double booking.
- Implement patient/doctor views, status transitions, cancellation rules, detail authorization, admin search, and analytics.
- Add notification events and telemedicine meeting adapter contracts where consultation mode requires them.

### Exit gate

- FR-APPOINTMENT-001 through FR-APPOINTMENT-007 pass.
- Concurrency, transition matrix, ownership, cancellation cutoff, filtering, and analytics are verified.

## Phase 7 - Payments and invoices

### Deliverables

- Add Payment, refund, webhook-event, and invoice persistence with idempotency constraints.
- Integrate Stripe Payment Intents, signed webhook processing, refunds, payment detail/history, and admin reporting.
- Generate immutable invoice records and downloadable invoice documents.
- Reconcile payment and appointment state transactionally and safely handle duplicate/out-of-order webhooks.

### Exit gate

- FR-PAYMENT-001 through FR-PAYMENT-007 pass using Stripe test mode and webhook fixtures.
- Currency minor units, idempotency, signatures, refunds, reconciliation, and authorization are verified.

## Phase 8 - Prescriptions

### Deliverables

- Add Prescription and medicine-item persistence with appointment, doctor, and patient relationships.
- Implement create, update, detail, patient history, PDF generation, doctor statistics, and admin analytics.
- Enforce completed-appointment, assigned-doctor, ownership, and edit-window rules.
- Store generated documents privately with auditable access.

### Exit gate

- FR-PRESCRIPTION-001 through FR-PRESCRIPTION-007 pass, including PDF content and medical-data access tests.

## Phase 9 - Reviews and ratings

### Deliverables

- Add Review and doctor-response persistence with one-review-per-eligible-appointment constraints.
- Implement create, update, doctor/patient lists, delete, statistics, and doctor responses.
- Recalculate doctor rating aggregates transactionally and invalidate doctor caches.
- Add moderation/audit hooks without silently altering patient-authored content.

### Exit gate

- FR-REVIEW-001 through FR-REVIEW-007 pass, including eligibility, uniqueness, rating aggregation, ownership, and response rules.

## Phase 10 - Production hardening and release

### Deliverables

- Complete Redis caching policies, cache-key standards, invalidation coverage, and graceful cache degradation.
- Add security hardening: headers, strict CORS, abuse controls, dependency scanning, secret handling, encryption policy, and security tests.
- Add structured audit/application logs, metrics, health/readiness checks, alerting hooks, retention/redaction rules, and correlation IDs.
- Meet response-time and scalability targets through query analysis, indexes, load tests, pagination, and background jobs.
- Reach the required unit/integration/end-to-end coverage and add deterministic test data factories.
- Produce OpenAPI documentation, deployment/container artifacts, backup/restore procedures, and operational runbooks.
- Complete healthcare/privacy and PCI scope review with documented data flows and retention/access controls.

### Exit gate

- Every NFR has objective evidence: automated result, benchmark, configuration check, runbook, or approved compliance record.
- Clean production build and migration rehearsal succeed in a production-like environment.
- Rollback, backup restore, monitoring, and incident procedures are exercised.

## Progress log

| Date | Phase | Update |
| --- | --- | --- |
| 2026-08-24 | 0 | Repository audited; phased implementation plan created; foundation implementation started. |
| 2026-08-24 | 0 | Foundation completed: validated configuration, versioned routing, security middleware, logging, response envelopes, graceful shutdown, and integration test harness. |
| 2026-08-24 | 1 | Auth persistence migration, Better Auth adapter configuration, JWT/session security, transactional auth flows, email templates, cleanup job, API routes, and initial security tests implemented. Live-database acceptance validation remains. |
| 2026-08-24 | 2 | Admin profile migration, hierarchical/exact RBAC, status and stale-role checks, service ownership policy, atomic admin management, audit/cache hooks, API docs, and policy/service tests implemented. Live-database acceptance validation remains. |
| 2026-08-24 | Architecture | Restructured Auth, Admin, and Health into feature-owned modules; added shared constants/validation/rate-limit boundaries, multi-file Prisma schemas, structured test directories, seed entry point, and a permanent architecture convention. |
| 2026-08-24 | Architecture | Aligned the source root with the provided reference: application folders now live under `src/app`, `lib` contains Prisma, domain code uses `src/app/module`, and legacy empty folders were removed. |
| 2026-08-24 | 3 | Doctor/Specialty schemas and modules implemented with CRUD, ownership, assignment, discovery, soft deletion, cache, audit, notifications, documentation, and validation tests. Live-database and later-model dependency acceptance checks remain. |
