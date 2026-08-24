# Appointment Lifecycle API

Base path: `/api/v1/appointments`

The module lives in `src/app/module/appointment` and owns its controller, service, routes, validation, payment/video/email adapters, time calculations, and lifecycle cleanup.

## Endpoints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/` | PATIENT, ADMIN, SUPER_ADMIN | Book an appointment and initiate its pending payment |
| GET | `/patient/:patientId` | Patient owner, ADMIN/SUPER_ADMIN | Paginated patient history with doctor, schedule, and payment |
| GET | `/doctor/:doctorId` | Doctor owner, ADMIN/SUPER_ADMIN | Paginated/grouped doctor workload with patient health summary |
| GET | `/search` | ADMIN, SUPER_ADMIN | Combined search, filters, pagination, revenue/status/specialty analytics |
| GET | `/:appointmentId` | Assigned patient/doctor, ADMIN/SUPER_ADMIN | Role-sanitized appointment detail and conditional video link |
| PATCH | `/:appointmentId/status` | Assigned doctor or administrator; patient cancellation only | Apply a valid lifecycle transition |
| POST | `/:appointmentId/cancel` | Assigned patient/doctor, ADMIN/SUPER_ADMIN | Apply cancellation/refund policy atomically |

## Transactional booking

```json
{
  "doctorId": "doctor-uuid",
  "scheduleId": "schedule-uuid",
  "patientId": "patient-uuid",
  "notes": "Optional notes",
  "emergency": false
}
```

Booking locks the patient and schedule, then validates ownership, patient health data, active accounts, future time, schedule ownership/availability, overlapping patient appointments, five-per-month limits, and same-doctor seven-day spam prevention. `emergency=true` is admin-only and bypasses only the monthly/seven-day limits.

Appointment creation, the immutable doctor-fee snapshot, pending payment, and `Schedule.isBooked=true` are one transaction. A PostgreSQL partial unique index permits only one active (`SCHEDULED` or `INPROGRESS`) appointment per schedule, providing a second concurrency boundary.

The Phase 6 payment adapter derives the amount exclusively from `Doctor.appointmentFee`, creates a 30-minute pending record, and returns an application payment link. Phase 7 will replace this adapter with Stripe Payment Intents, Checkout, webhooks, and real refund calls without changing the appointment transaction contract.

## Lifecycle

```text
SCHEDULED -> INPROGRESS -> COMPLETED
SCHEDULED -> CANCELLED
```

- Only the assigned doctor or an administrator can start/complete an appointment.
- Starting more than 15 minutes early is rejected.
- Patients can only cancel `SCHEDULED` appointments.
- Final `COMPLETED` and `CANCELLED` states cannot be reverted.
- A five-minute cleanup cancels unpaid bookings after 30 minutes and releases the schedule.
- `INPROGRESS` appointments and unattended scheduled appointments auto-complete after 24 hours.

## Cancellation and refunds

| Actor/time before start | Allowed | Paid-payment result |
| --- | --- | --- |
| Patient, at least 24 hours | Yes | Full refund |
| Doctor, at least 24 hours | Yes | Full refund |
| Doctor, 12–24 hours | Yes | 50% partial refund |
| Admin, at least 24 hours | Yes | Full refund |
| Admin, 12–24 hours | Yes | 50% partial refund |
| Admin, under 12 hours | Yes | No refund |

Cancellation records the actor, role, reason, timestamp, refund type/amount, updates payment state, and releases the schedule in one transaction. Actual Stripe refund execution is the Phase 7 adapter responsibility.

## Privacy and video access

Patients can view only their appointments; doctors can view only assigned appointments. Assigned doctors now gain patient health and medical-report access through the Appointment relationship. Patient-facing views do not expose the full health summary.

Each appointment stores a random meeting ID. A short-lived signed video token is returned only from 15 minutes before start until one hour after end; cancelled appointments and requests outside the window receive no link.

Prescription and review fields remain `null` until Phases 8 and 9 create those relations.

## Filters

Patient and doctor views support status lists, date filters, pagination, and role-specific filters. Admin search combines patient/doctor search, status, payment status, specialty, date, and fee ranges with controlled sorting. Analytics include total count, status breakdown, paid revenue, average paid fee, and popular specialties.

## Main errors

| Status | Codes |
| --- | --- |
| 400 | `VALIDATION_ERROR`, `HEALTH_DATA_REQUIRED`, `PAST_APPOINTMENT_SLOT`, `INVALID_STATUS_TRANSITION`, `APPOINTMENT_TOO_EARLY`, `CANCELLATION_WINDOW_CLOSED` |
| 401 | `AUTHENTICATION_REQUIRED` |
| 403 | `FORBIDDEN`, `PATIENT_ASSIGNMENT_REQUIRED` |
| 404 | `PATIENT_NOT_FOUND`, `SCHEDULE_NOT_FOUND`, `APPOINTMENT_NOT_FOUND` |
| 409 | `SCHEDULE_ALREADY_BOOKED`, `PATIENT_DOUBLE_BOOKING`, `MONTHLY_APPOINTMENT_LIMIT`, `DOCTOR_REBOOKING_LIMIT`, `APPOINTMENT_FINALIZED`, `APPOINTMENT_NOT_CANCELLABLE`, `APPOINTMENT_STATUS_CONFLICT` |

## Requirement coverage

- FR-APPOINTMENT-001: atomic booking/payment/schedule state, locking, constraints, video ID, notifications.
- FR-APPOINTMENT-002: patient history, multi-status/date/upcoming filters, related records, pagination, ownership.
- FR-APPOINTMENT-003: doctor filters, ordering/grouping, payment and privacy-limited health summary, ownership.
- FR-APPOINTMENT-004: transition matrix, role/time checks, audit history, automated completion.
- FR-APPOINTMENT-005: role cutoffs, refund tiers, atomic release, notification and cancellation audit.
- FR-APPOINTMENT-006: complete role-sanitized detail, assigned ownership, signed video window, later-record placeholders.
- FR-APPOINTMENT-007: admin-only combined search, pagination, sorting, and analytics.
