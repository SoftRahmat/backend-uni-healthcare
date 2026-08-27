# Doctor and Specialty API

## Module ownership

- Doctor: `src/app/module/doctor/`
- Specialty: `src/app/module/specialty/`
- Prisma: `prisma/schema/doctor.prisma` and `prisma/schema/specialty.prisma`

Both modules own their controller, service, routes, validation, and domain helpers.

## Doctor endpoints

Base path: `/api/v1/doctors`

- `POST /` — `ADMIN` or `SUPER_ADMIN`; atomically creates User, Doctor, credential, password history, specialty assignments, and audit event. Sends doctor welcome instructions.
- `GET /me` — `DOCTOR`; returns the authenticated doctor's complete own-profile view by session-linked profile ID, including profiles that are not publicly visible.
- `PATCH /me` — `DOCTOR`; updates only the caller's profile and rejects email/status, registration, and rating changes.
- `PATCH /:doctorId` — doctor ownership or admin override; admins may change email/status, while registration and rating fields remain immutable.
- `GET /` — public, optionally authenticated; supports page/limit, specialty, gender, experience, fee, search, and sorting. Public callers only see active doctors; admins can also see blocked doctors.
- `GET /:doctorId` — public detail with specialties and rating fields. Blocked doctors are hidden from non-admin callers.
- `DELETE /:doctorId` — `ADMIN` or `SUPER_ADMIN`; soft-deletes the doctor, blocks login, revokes sessions, records the actor/reason, invalidates caches, and sends deactivation notice. `force` is super-admin-only.

Doctor lists cache for five minutes; doctor details cache for ten minutes. No credential, User relation ID, account, or session fields are returned.

## Specialty endpoints

Base path: `/api/v1/specialties`

- `GET /` — public paginated/searchable active list with active-doctor counts; cached for one hour.
- `POST /` — `ADMIN` or `SUPER_ADMIN`; case-insensitive title uniqueness and URL/emoji icon validation.
- `PATCH /:specialtyId` — `ADMIN` or `SUPER_ADMIN`; partial update with uniqueness checks.
- `DELETE /:specialtyId` — `SUPER_ADMIN`; soft deletion is blocked while active doctors are assigned or when deletion would leave fewer than five active specialties.

All mutations invalidate specialty and affected doctor caches and create audit records.

## Requirement coverage status

| Requirement          | Status                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-DOCTOR-001        | Implemented: atomic creation, credential/fee validation, defaults, specialties, welcome workflow                                                                                                         |
| FR-DOCTOR-002        | Implemented: ownership/admin override, partial updates, immutable fields, specialty replacement, User synchronization, invalidation                                                                      |
| FR-DOCTOR-003        | Implemented: pagination, filters, sorting, related specialties, sanitization, active visibility, five-minute cache                                                                                       |
| FR-DOCTOR-004        | Core detail and ten-minute cache implemented; reviews and schedule availability populate when Phases 5 and 9 add those models                                                                            |
| FR-DOCTOR-005        | Core soft deletion, login/session prevention, audit, email, cache, appointment and retained-prescription relations implemented; patient-impact notification expansion remains an external workflow check |
| FR-SPECIALTY-001–004 | Implemented: CRUD, authorization, uniqueness, public counts/list, caching, dependency/minimum rules, soft deletion                                                                                       |
