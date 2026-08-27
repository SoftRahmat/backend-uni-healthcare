# Authentication API

Base path: `/api/v1/auth`

All responses use the project envelope. Successful responses contain `success`, `message`, and `data`; errors contain `success: false`, `message`, `error.code`, `statusCode`, and `requestId`.

Protected endpoints accept the browser's `HttpOnly` authentication cookie or `Authorization: Bearer <access-token>` for non-browser clients. Access tokens expire after seven days and are valid only while their referenced database session remains active.

## Public endpoints

### `POST /register`

Creates a pending patient account, credential account, patient identity shell, initial password-history record, hashed verification token, and audit event in one transaction.

```json
{
  "name": "Amina Rahman",
  "email": "amina@example.com",
  "password": "Strong!Password1",
  "contactNumber": "+8801700000000",
  "address": "Dhaka"
}
```

Returns `201`. Duplicate email returns `409 EMAIL_ALREADY_EXISTS`; invalid input returns `400 VALIDATION_ERROR`.

### `POST /verify-email`

```json
{ "token": "64-character-token-from-email" }
```

Activates a pending account. Tokens expire after 24 hours and are one-time. Invalid, expired, or consumed tokens return `400 INVALID_VERIFICATION_TOKEN`.

### `POST /resend-verification`

```json
{ "email": "amina@example.com" }
```

Returns a generic `200` response. For eligible pending accounts, the previous token is invalidated and a new one is sent. Resends are limited to one every five minutes.

### `POST /login`

```json
{ "email": "amina@example.com", "password": "Strong!Password1" }
```

Returns the JWT access token, seven-day lifetime, and sanitized user/patient profile. Browser clients also receive a seven-day `HttpOnly`, production-`Secure`, `SameSite=Strict` cookie. Pending and blocked accounts return `403`; deleted accounts return `404`; invalid credentials return `401`. Five failures in 15 minutes trigger temporary throttling, and ten consecutive failures block the account pending an administrative unlock.

### `POST /forgot-password`

```json
{ "email": "amina@example.com" }
```

Always returns a generic `200` response. Eligible accounts receive a one-hour, one-time reset token. At most three reset emails are generated per account per hour.

### `POST /reset-password`

```json
{
  "token": "64-character-token-from-email",
  "password": "Another!Password2"
}
```

Changes the credential, rejects the last three passwords, revokes every session, consumes the token, records an audit event, and sends a security notification.

## Protected endpoints

- `GET /me` — restores the sanitized current user from the active browser or bearer session.
- `POST /change-password` — body: `currentPassword`, `newPassword`, and optional `revokeOtherSessions` (defaults to `true`). The current session remains active.
- `POST /logout` — idempotently terminates the current session.
- `POST /logout-all` — terminates every session, including the caller's session.
- `GET /sessions` — returns active sessions with IP address, user agent, creation, activity, expiry, and `isCurrent` metadata.
- `DELETE /sessions/:sessionId` — terminates another owned session. Use `/logout` for the current session.

## Security and persistence notes

- Passwords are bcrypt-hashed with a configurable work factor of at least 10 (default 12).
- Verification and reset tokens contain 32 random bytes and only their SHA-256 hashes are stored.
- The Better Auth Prisma schema and adapter are configured internally. Raw Better Auth routes are deliberately not mounted because product status, history, lockout, and audit rules must pass through the domain service.
- Expired sessions/tokens and old login-attempt records are cleaned at startup and every 24 hours.
- Authentication audit records never contain passwords, access tokens, session tokens, or raw email-action tokens.
- Cookie-authenticated state changes require an allowed `Origin`; this complements `SameSite=Strict` protection against CSRF. Bearer clients are unaffected.

## Requirement coverage

| Requirement | Implementation                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| FR-AUTH-001 | Transactional registration, normalized unique email, bcrypt, PATIENT/PENDING defaults, patient shell   |
| FR-AUTH-002 | Hashed 32-byte token, 24-hour expiry, atomic one-time claim, five-minute resend throttle, templates    |
| FR-AUTH-003 | Status checks, JWT claims, database session, IP/user agent, lockout/throttle, sanitized profile        |
| FR-AUTH-004 | Generic discovery response, one-hour hashed token, three/hour limit, history check, global revocation  |
| FR-AUTH-005 | Current-password check, history, transactional update, optional other-session revocation, notification |
| FR-AUTH-006 | Idempotent current/all-session logout with audit events                                                |
| FR-AUTH-007 | Session list/revoke, seven-day expiry, five-session cap, daily cleanup                                 |
