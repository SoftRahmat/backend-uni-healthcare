# Project Architecture

This repository follows section 8.2 of the PH-HealthCare requirements document.

## Permanent module convention

Every business domain is implemented under `src/app/module/<domain>/`. Each module owns its HTTP and business-layer files:

```text
src/app/module/<domain>/
├── <domain>.controller.ts
├── <domain>.service.ts
├── <domain>.routes.ts
├── <domain>.validation.ts
└── <domain-specific helpers when needed>
```

Controllers translate HTTP requests and responses. Services enforce business rules and own persistence orchestration. Routes declare middleware and endpoint bindings. Validation files own the module's Zod contracts. Domain-specific email, cache, repository, policy, mapping, and type files stay within the module that owns them.

Do not create horizontal controller, service, route, or schema folders outside `src/app/module/<domain>/`.

## Shared code boundaries

- `src/app/config`: runtime and external-client configuration.
- `src/app/errorHelpers`: shared operational error classes.
- `src/app/interfaces`: application-wide TypeScript declarations.
- `src/app/lib`: initialized library clients such as Prisma.
- `src/app/middleware`: reusable authentication, RBAC, validation, rate-limit, logging, and error boundaries.
- `src/app/shared`: shared constants and stable cross-module values.
- `src/app/templates`: reusable notification and document templates.
- `src/app/utils`: domain-neutral helpers and shared policy primitives.
- `src/app/routes/index.ts`: API module composition only; domain endpoints remain in their modules.
- `src/app.ts` and `src/server.ts`: Express construction and process entry point.

Shared code must be genuinely cross-domain. If only one module consumes a helper, keep it inside that module.

## Prisma convention

Prisma uses its supported multi-file layout. `prisma/schema.prisma` contains the generator and datasource, while domain models live under `prisma/schema/*.prisma`. New phases add or extend the matching domain schema file without combining all models back into one file.

## Test convention

- `tests/unit`: validation, mapping, policy, and isolated service tests.
- `tests/integration`: Express/module integration tests.
- `tests/e2e`: live-database and complete workflow tests.

Every future implementation phase must preserve this structure as part of its exit gate.
