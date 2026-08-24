# Review and Rating API

Phase 9 implements FR-REVIEW-001 through FR-REVIEW-007 under `src/app/module/review`.

## Lifecycle and rules

- Only the verified patient from a completed appointment can submit one review, within 30 days of completion.
- Ratings are integers from 1–5; comments are optional and limited to 1000 characters.
- HTML/executable content is rejected. Potential profanity or spam is preserved for audit, flagged, removed from public/rating aggregates, and surfaced to administrators.
- Authors may update or soft-delete within seven days. Administrators cannot edit patient content but may soft-delete with a mandatory reason.
- Every rating mutation transactionally recalculates the doctor's average and count and invalidates doctor/review caches.
- Doctors below the required 3-star verified average are hidden publicly; averages below 2.5 additionally trigger mandatory administrator review.
- A verified review awards a one-time 5% discount, consumed atomically by the patient's next appointment booking.
- Only the reviewed doctor may post one professional response within 30 days. Responses cannot be edited or deleted.

## Endpoints

| Method and path                           | Access              | Purpose                                                                                   |
| ----------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/v1/reviews`                    | Appointment patient | Submit a verified review                                                                  |
| `PATCH /api/v1/reviews/:reviewId`         | Author              | Update within seven days                                                                  |
| `DELETE /api/v1/reviews/:reviewId`        | Author or admin     | Soft-delete; admin reason required                                                        |
| `GET /api/v1/reviews/doctor/:doctorId`    | Public              | Paginated reviews, response, distribution and percentages; cached 15 minutes              |
| `GET /api/v1/reviews/patient/:patientId`  | Owner or admin      | Submitted reviews with editability and remaining time                                     |
| `POST /api/v1/reviews/:reviewId/response` | Reviewed doctor     | Add the permanent doctor response                                                         |
| `GET /api/v1/reviews/admin/statistics`    | Admin               | Platform totals, trends, distribution, flagged/low-rated items and doctor attention lists |

Public filters support rating, date range, verified-only, sorting by rating or creation date, and a maximum page size of 50. Patient names default to first name plus last initial while the record remains linked to a verified patient internally.

Doctor and patient notifications are sent for review creation, doctor responses, and deletion. Review deletion reasons, moderation flags, actions, and response creation are audited.
