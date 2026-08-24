# Payment and Invoice API

Phase 7 implements FR-PAYMENT-001 through FR-PAYMENT-007 under the permanent `src/app/module/payment` boundary.

## Stripe flow

Booking creates the appointment, payment, initial attempt, 30-minute payment window, and one Stripe Checkout Session. Checkout creates and owns its PaymentIntent; creating an independent PaymentIntent as well would represent a second charge attempt. The booking response includes `checkoutUrl` and a nullable `clientSecret` (hosted Checkout normally uses the URL). Amounts are derived from the doctor's fee and optional configured tax, converted to Stripe minor units, and protected with per-attempt idempotency keys.

`POST /api/v1/payments/webhooks/stripe` is public only for Stripe delivery. It requires the `Stripe-Signature` header, verifies it against the unmodified request bytes, persists every event ID, returns HTTP 200 for already-processed duplicates, and retries previously failed or stale processing records. Supported reconciliation events are:

- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.succeeded`
- `charge.refunded`

Successful payments create an immutable invoice asynchronously. Failed or cancelled intents cancel the appointment and release its schedule. Stripe webhook delivery is exempt from the browser/API rate limiter but remains signature protected.

## Authenticated endpoints

| Method and path                                                   | Access                                 | Purpose                                                                      |
| ----------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /payments/:paymentId`                                        | Owning patient, assigned doctor, admin | Details, timeline, attempts, refunds; provider IDs are masked for non-admins |
| `GET /payments/history/patient/:patientId`                        | Owner or admin                         | Paginated patient history with filters and totals                            |
| `GET /payments/history/doctor/:doctorId`                          | Assigned doctor or admin               | Paginated doctor payment history                                             |
| `GET /payments/history/patient/:patientId/export?format=csv\|pdf` | Owner or admin                         | Download history export                                                      |
| `GET /payments/:paymentId/invoice`                                | Payment-authorized roles               | Create/retrieve invoice and return a 24-hour signed private URL              |
| `POST /payments/:paymentId/refunds`                               | Admin                                  | Full or partial Stripe refund for a cancelled appointment                    |
| `GET /payments/admin/dashboard`                                   | Admin                                  | Revenue, daily/monthly trends, statuses, refund rate, recent 50              |
| `GET /payments/admin/history`                                     | Admin                                  | Filtered system-wide payment history                                         |
| `POST /payments/:paymentId/admin-actions`                         | Admin                                  | Retry, justified manual-paid override, or audited note                       |

History filters are `status`, `startDate`, `endDate`, `minAmount`, `maxAmount`, `page`, and `limit`. Retries are capped at three and create a fresh Checkout Session/idempotency key. Cancelled appointments cannot be retried. Refund totals cannot exceed the captured subtotal plus tax.

## Invoices and retention

PDF invoices include a unique versioned number, issue and service dates, patient and doctor, consultation line item, tax, total, payment status, and transaction reference. PDFs are checksummed, encrypted in private object storage, versioned, retained for seven years, and exposed only through time-limited signed links. Payment records themselves are not automatically deleted.

## Configuration

Production requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Currency, success/cancel URLs, company identity, tax ID, tax rate in basis points, and display symbol are documented in `.env.example`. Development/test mode uses a deterministic local checkout adapter when Stripe is intentionally unset.
