# PulseHarbor Healthcare Backend

TypeScript and Express backend for the PH-HealthCare platform, with PostgreSQL/Prisma persistence, role-based access control, private medical-document storage, Stripe payments, prescriptions, and verified patient reviews.

## Project status

Implementation follows the phased roadmap in [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md). Feature code uses the permanent `src/app/module/<domain>/` convention required by section 8.2 of the project requirements.

## Technology

- Node.js, TypeScript, Express, and Zod
- PostgreSQL with Prisma's multi-file schema
- Better Auth sessions plus JWT access tokens
- S3-compatible private document storage
- Stripe Checkout, webhooks, refunds, and PDF invoices
- PDFKit and QR-coded prescription documents
- Vitest, Supertest, and ESLint

## Documentation

| Document                                                             | Scope                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md)                   | Delivery phases, exit gates, and progress log                       |
| [Architecture](docs/ARCHITECTURE.md)                                 | Required feature-module layout and shared-code boundaries           |
| [Authentication API](docs/AUTH_API.md)                               | Registration, verification, sessions, passwords, and login security |
| [Admin and RBAC API](docs/ADMIN_RBAC_API.md)                         | Roles, administrative profiles, and authorization boundaries        |
| [Doctor and specialty API](docs/DOCTOR_SPECIALTY_API.md)             | Doctor lifecycle, specialties, discovery, and profile visibility    |
| [Patient and medical-report API](docs/PATIENT_MEDICAL_REPORT_API.md) | Patient health data and private medical reports                     |
| [Schedule API](docs/SCHEDULE_API.md)                                 | Doctor availability and schedule ownership                          |
| [Appointment API](docs/APPOINTMENT_API.md)                           | Booking, lifecycle, cancellation, video access, and analytics       |
| [Payment API](docs/PAYMENT_API.md)                                   | Stripe Checkout, webhooks, refunds, histories, and invoices         |
| [Prescription API](docs/PRESCRIPTION_API.md)                         | Versioned prescriptions, medicines, PDFs, reminders, and analytics  |
| [Review API](docs/REVIEW_API.md)                                     | Verified ratings, moderation, responses, discounts, and statistics  |
| [Support API](docs/SUPPORT_API.md)                                   | Guest and authenticated support-ticket submission                   |

## Prerequisites

- Node.js 24 LTS
- pnpm 11 (the repository declares pnpm as its package manager)
- PostgreSQL running locally or an accessible PostgreSQL connection
- The sibling `frontend-uni-healthcare` repository for the browser application
- Optional for complete integration testing: an S3-compatible private bucket, Stripe test-mode credentials, and an external malware scanner

Enable pnpm through Corepack if it is not already installed:

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm --version
```

Do not use `npm install` in this repository. The package-manager declaration intentionally expects pnpm.

## Local setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create the PostgreSQL database

Create a database named `ph_healthcare`, or use another name and update `DATABASE_URL` accordingly:

```sql
CREATE DATABASE ph_healthcare;
```

Example local connection:

```env
DATABASE_URL=postgresql://postgres:12345@localhost:5432/ph_healthcare?schema=public
```

Replace the username, password, host, port, and database name with your PostgreSQL values. A `P1000` error means the database credentials are not accepted; it is not a Prisma schema error.

### 3. Configure the environment

Copy the example file and edit the new `.env` file:

```powershell
Copy-Item .env.example .env
```

```bash
cp .env.example .env
```

At minimum, configure:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET` and `JWT_SECRET`, using two different values of at least 32 characters
- `CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200`
- `APP_BASE_URL=http://localhost:5000`
- `CLIENT_BASE_URL=http://localhost:4200`
- `SCHEDULE_TIME_ZONE`, using a valid IANA timezone such as `UTC` or `Asia/Singapore`
- `PAYMENT_SUCCESS_URL=http://localhost:4200/payments/success?session_id={CHECKOUT_SESSION_ID}`
- `PAYMENT_CANCEL_URL=http://localhost:4200/payments/cancelled`

The frontend uses credentialed cookie requests. Its exact origin must be present in `CORS_ORIGINS`; do not use an unrelated port or a route path. Restart the backend after changing `.env`.

### 4. Generate Prisma and apply migrations

```bash
pnpm run generate
pnpm run migrate
```

`pnpm run migrate` runs `prisma migrate dev` and applies the committed authentication, administration, doctor, patient, schedule, appointment, payment, prescription, review, and support-ticket migrations.

### 5. Seed the first super administrator (optional)

Set the three `SEED_SUPER_ADMIN_*` variables in `.env`, then run:

```bash
pnpm run seed
```

The seed is intentionally narrow. It creates or updates one verified, active `SUPER_ADMIN`, its administrator profile, credential account, and password history. It does not create doctors, patients, specialties, schedules, appointments, or payments. The seeded account must change its temporary password after signing in.

### 6. Start the API

```bash
pnpm run dev
```

Local endpoints:

| URL                                  | Purpose                   |
| ------------------------------------ | ------------------------- |
| `http://localhost:5000/`             | API information           |
| `http://localhost:5000/health`       | Process liveness          |
| `http://localhost:5000/health/ready` | Database-aware readiness  |
| `http://localhost:5000/api/v1`       | Versioned application API |

Start the Angular frontend after the readiness endpoint succeeds.

## Development email verification

Email delivery is not required for local development. To expose the development-only verification action, set:

```env
NODE_ENV=development
ALLOW_DEV_EMAIL_VERIFICATION_BYPASS=true
```

The frontend development environment also enables its matching UI. The backend rejects this bypass in test and production environments. Keep it disabled outside local development.

## Optional integrations

- **Medical documents:** configure `S3_REGION`, `S3_BUCKET`, and either the runtime's IAM/default credentials or both explicit S3 credential variables. `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true` support local S3-compatible services.
- **Malware scanning:** local signature checks always run. Production uploads require `VIRUS_SCAN_URL`; uploads fail closed if the scanner is unavailable.
- **Stripe:** configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to exercise checkout, signed webhooks, refunds, and invoice workflows. Both are required when `NODE_ENV=production`.
- **Email:** the current adapter logs development messages. Configure a production delivery adapter before release.

Core authentication, catalog, profile, schedule, appointment, review, and support development can run without live Stripe or S3 credentials, but the provider-specific journeys cannot be accepted as complete without those services.

## Quality commands

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

Run the combined local gate with `pnpm run check`. Live Stripe, S3, email, concurrency, and production-like database acceptance checks require their corresponding external services and credentials.

Tests run with `NODE_ENV=test`. Keep `ALLOW_DEV_EMAIL_VERIFICATION_BYPASS=false` when running the test suite; the application intentionally rejects the bypass outside development.

## Production run

```bash
pnpm exec prisma migrate deploy
pnpm run build
pnpm start
```

Apply reviewed migrations before starting the production artifact, provide production secrets through a secret manager, use HTTPS, set exact production CORS/client URLs, configure `TRUST_PROXY` for the deployment topology, and keep `ALLOW_DEV_EMAIL_VERIFICATION_BYPASS=false`.

## Common setup issues

| Symptom                                      | Check                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `EBADDEVENGINES` mentions npm                | Use pnpm 11 through Corepack instead of `npm install`.                                          |
| `pnpm` is not recognized                     | Run the Corepack commands in Prerequisites, then open a new terminal if necessary.              |
| Prisma `P1000`                               | Correct the PostgreSQL username/password in `DATABASE_URL` and verify PostgreSQL is running.    |
| `CORS_ORIGIN_DENIED`                         | Add the exact Angular origin to `CORS_ORIGINS` and restart the API.                             |
| Login still requires email verification      | Enable the development bypass in both apps, keep `NODE_ENV=development`, and restart both apps. |
| Schedule creation has no available book time | Create future doctor schedules; only active, unbooked slots inside the booking window appear.   |
