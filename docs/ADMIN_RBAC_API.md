# RBAC and Administrator API

## Authorization model

Every protected request must pass authentication and an account-status check. The middleware verifies the JWT signature and expiration, loads the referenced live session, verifies that the database user is `ACTIVE`, confirms that the token role still matches the database role, and attaches the authenticated identity and profile ID to the request.

Roles are ranked `SUPER_ADMIN > ADMIN > DOCTOR > PATIENT`. Two authorization policies are available:

- `authorize(...)` provides hierarchical inheritance.
- `authorizeExact(...)` enforces the explicit permission matrix for sensitive operations that higher roles must not inherit automatically.

Service methods use `assertResourceOwnership(...)` for user/profile ownership. It supports an explicit admin override, reports when that override was used, and can disable overrides for restricted resources. Controllers alone are never treated as the ownership boundary.

## Administrator endpoints

Base path: `/api/v1/admins`

All routes require `Authorization: Bearer <access-token>`.

### `POST /`

Exact role: `SUPER_ADMIN`.

```json
{
  "name": "Operations Admin",
  "email": "operations@example.com",
  "password": "Temporary!Password1",
  "contactNumber": "+12345678901",
  "profilePhoto": "https://example.com/admin.jpg"
}
```

Creates the User, Admin profile, credential account, initial password-history entry, and audit event atomically. The user is `ADMIN`, `ACTIVE`, email-verified, and has `needPasswordChange: true`. A welcome message containing sign-in instructions and the temporary password is sent after commit.

Returns `201`. Duplicate email returns `409 EMAIL_ALREADY_EXISTS`.

### `PATCH /me`

Exact roles: `ADMIN`, `SUPER_ADMIN`.

Admins may update their own `name`, `contactNumber`, and `profilePhoto`. Only a super admin may include `email`, `role`, or `status`.

### `PATCH /:adminId`

Exact roles: `ADMIN`, `SUPER_ADMIN` at the route boundary; the service then permits normal admins only when `:adminId` is their own profile. A super admin may update any admin and may change:

- `role`: `ADMIN` or `SUPER_ADMIN`
- `status`: `ACTIVE` or `BLOCKED`
- `email`, synchronized atomically between User and Admin
- normal profile fields

Blocking an administrator immediately revokes their sessions. Role changes make existing JWTs stale. Updates invalidate admin, user, and list cache keys and write audit records containing the actor ID and changed fields.

### `GET /`

Exact role: `SUPER_ADMIN`.

Query parameters:

| Parameter        | Default     | Rules                              |
| ---------------- | ----------- | ---------------------------------- |
| `page`           | `1`         | Minimum 1                          |
| `limit`          | `10`        | 1–100                              |
| `searchTerm`     | —           | Case-insensitive name/email search |
| `status`         | —           | `ACTIVE` or `BLOCKED`              |
| `role`           | —           | `ADMIN` or `SUPER_ADMIN`           |
| `sortBy`         | `createdAt` | `createdAt`, `name`, or `email`    |
| `sortOrder`      | `desc`      | `asc` or `desc`                    |
| `includeDeleted` | `false`     | Super-admin soft-delete visibility |

The response contains only the public Admin ID and profile/user presentation fields. It excludes `userId`, account records, password hashes, session tokens, and other internal relationship identifiers.

## Requirement coverage

| Requirement  | Implementation evidence                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-RBAC-001  | Non-null Prisma role enum, rank map, token/database role validation, one-to-one Admin/Patient profiles                 |
| FR-RBAC-002  | Authentication, hierarchical and exact-role middleware, status errors, multiple allowed roles                          |
| FR-RBAC-003  | Reusable service-layer ownership assertion, cross-user denial, configurable admin override                             |
| FR-ADMIN-001 | SUPER_ADMIN route and service checks, atomic identity/profile/credential creation, validation, defaults, welcome email |
| FR-ADMIN-002 | Self-versus-super privilege rules, atomic User/Admin synchronization, session/cache invalidation, audit events         |
| FR-ADMIN-003 | Pagination, filters, search, sorting, soft-delete visibility, sanitized response mapping, list audit                   |
