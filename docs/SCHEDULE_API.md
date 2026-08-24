# Doctor Schedule API

Base path: `/api/v1/schedules`

The Schedule module owns its controller, service, routes, validation, caching rules, and business policies under `src/app/module/schedule`.

## Endpoints

| Method | Path           | Access                            | Purpose                                      |
| ------ | -------------- | --------------------------------- | -------------------------------------------- |
| POST   | `/`            | DOCTOR, ADMIN, SUPER_ADMIN        | Create one or up to 100 schedules atomically |
| GET    | `/`            | Public                            | Read a doctor's upcoming availability        |
| PATCH  | `/:scheduleId` | Owning DOCTOR, ADMIN, SUPER_ADMIN | Partially update an unbooked schedule        |
| DELETE | `/:scheduleId` | Owning DOCTOR, ADMIN, SUPER_ADMIN | Soft-delete a future, unbooked schedule      |

Doctors may omit `doctorId` during creation; the authenticated doctor profile is used. Administrators must supply the target `doctorId`.

## Create one schedule

```json
{
  "doctorId": "doctor-uuid",
  "scheduleDate": "2026-09-01",
  "startTime": "09:00",
  "endTime": "10:00"
}
```

## Atomic bulk creation

```json
{
  "doctorId": "doctor-uuid",
  "schedules": [
    { "scheduleDate": "2026-09-01", "startTime": "09:00", "endTime": "10:00" },
    { "scheduleDate": "2026-09-01", "startTime": "10:00", "endTime": "11:00" }
  ]
}
```

Each slot must use a real `YYYY-MM-DD` date and 24-hour `HH:mm` times. Dates must be today or later in `SCHEDULE_TIME_ZONE`; duration must be 30 minutes through 12 hours. Adjacent slots are allowed, while any same-doctor overlap returns HTTP 409. Bulk writes use one transaction and roll back completely if any slot conflicts.

Same-doctor mutations take a PostgreSQL advisory transaction lock before checking conflicts. This serializes concurrent schedule creation/update and closes the race between an overlap check and persistence.

## Public availability

`GET /api/v1/schedules?doctorId={uuid}` defaults to today through today plus seven days. Optional parameters:

| Parameter              | Description                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `date`                 | A specific `YYYY-MM-DD` date; overrides the range                          |
| `startDate`, `endDate` | Inclusive range                                                            |
| `showBooked`           | Defaults to `false`; `true` requires the owning doctor or an administrator |

Past dates are always excluded. Results sort by date and start time ascending and include doctor name, specialties, and appointment fee. Availability responses are cached per doctor/range/visibility for five minutes. Create, update, delete, doctor deactivation, and the future appointment-booking transaction invalidate the relevant schedule and doctor availability keys.

## Update and deletion rules

Updates accept any non-empty subset of `scheduleDate`, `startTime`, and `endTime`; validation runs again after merging the partial update with stored values. A booked schedule cannot be updated or deleted. Past schedules are archived and cannot be deleted. Deletion sets `isDeleted`, `deletedAt`, and deactivates the DoctorSchedule junction while preserving the audit record.

Phase 6 will set `Schedule.isBooked` in the same transaction that creates an appointment. The booking protection and visibility filters are already active, but a live booked-slot acceptance scenario depends on that Appointment model.

## Main errors

| Status | Code                                                                                                              | Meaning                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 400    | `VALIDATION_ERROR`, `DOCTOR_ID_REQUIRED`, `PAST_SCHEDULE_DATE`, `INVALID_TIME_RANGE`, `INVALID_SCHEDULE_DURATION` | Invalid request or timing                         |
| 401    | `AUTHENTICATION_REQUIRED`                                                                                         | Mutation has no valid session                     |
| 403    | `FORBIDDEN`                                                                                                       | Role, ownership, or booked-slot visibility denied |
| 404    | `DOCTOR_NOT_FOUND`, `SCHEDULE_NOT_FOUND`                                                                          | Active doctor or schedule not found               |
| 409    | `SCHEDULE_OVERLAP`, `SCHEDULE_ALREADY_BOOKED`, `PAST_SCHEDULE_ARCHIVED`                                           | Schedule conflicts with business state            |

## Requirement coverage

- FR-SCHEDULE-001: individual/bulk creation, atomicity, validation, concurrency-safe overlaps, ownership.
- FR-SCHEDULE-002: public filtered availability, booked visibility policy, doctor data, ordering, five-minute caching.
- FR-SCHEDULE-003: partial updates, merged-field validation, booking and overlap protection, ownership, invalidation.
- FR-SCHEDULE-004: soft deletion, booking and past-archive protection, ownership, invalidation, audit trail.
