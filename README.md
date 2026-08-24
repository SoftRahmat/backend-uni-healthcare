# PH-HealthCare Backend

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

## Development

1. Copy `.env.example` to `.env` and provide valid database, application-secret, storage, and provider values.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm run generate`.
4. Apply migrations with `pnpm run migrate`.
5. Start development mode with `pnpm run dev`.

## Quality commands

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

Run the combined local gate with `pnpm run check`. Live Stripe, S3, email, concurrency, and production-like database acceptance checks require their corresponding external services and credentials.
