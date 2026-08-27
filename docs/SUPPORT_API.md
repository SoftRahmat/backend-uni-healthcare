# Support API

PulseHarbor stores contact requests as support tickets so messages are not dependent on email delivery and can later be triaged by administrators.

## Submit a ticket

`POST /api/v1/support/tickets`

Authentication is optional. When a valid session is present, the ticket is linked to that user. Guest submissions remain supported.

```json
{
  "name": "Patient Name",
  "email": "patient@example.com",
  "category": "APPOINTMENT",
  "subject": "Change an appointment",
  "message": "I need help changing the time of my upcoming appointment.",
  "locale": "en"
}
```

Categories are `ACCOUNT`, `APPOINTMENT`, `PAYMENT`, `PRESCRIPTION`, `PRIVACY`, `TECHNICAL`, and `OTHER`. Supported locales are `en`, `bn`, `ms`, `es`, and `pt`.

The `201` response exposes only the reference needed by the requester:

```json
{
  "success": true,
  "message": "Support request received",
  "data": {
    "id": "ticket-id",
    "status": "OPEN",
    "createdAt": "2026-08-27T00:00:00.000Z"
  }
}
```

Requests pass through the application rate limiter and strict Zod validation. Each accepted request also creates an audit record without copying the private message into audit metadata.
