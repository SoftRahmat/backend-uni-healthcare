# PH-HealthCare Backend

Backend API for the PH-HealthCare platform.

## Architecture

The mandatory feature-module and multi-file Prisma conventions are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Product requirements are tracked through [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## Development

1. Copy `.env.example` to `.env` and provide valid database and secret values.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm run generate`.
4. Apply migrations with `pnpm run migrate`.
5. Start development mode with `pnpm run dev`.

Quality gate: `pnpm run check` and `pnpm run build`.
