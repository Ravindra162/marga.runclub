# Database design

The production target is PostgreSQL 15+ (Supabase is a suitable free-tier option while the club is small).

Apply the schema in this order:

```bash
psql "$DATABASE_URL" -f server/db/schema.sql
psql "$DATABASE_URL" -f server/db/seed.sql
```

The current JSON file API remains a development fallback. Once `DATABASE_URL` is configured, the API layer should use these tables instead of `server/data/registrations.json`.

## Why the model is split this way

### Event series vs occurrences

`event_series` stores reusable activities such as “Tuesday Badminton”. `event_occurrences` stores the actual date/time that people can book. This is important for capacity, cancellation, venue changes, and F1 calendar dates.

### Form templates vs versions vs fields

Organizers can create a form using `form_fields`. Publishing creates an immutable `form_version`. Each occurrence points to the exact version it used. If the organizer adds a question next month, past submissions still retain the original labels and field definitions.

Field-specific settings belong in `config_json`, for example:

```json
{
  "options": ["Beginner", "Intermediate", "Advanced"],
  "placeholder": "Choose your level",
  "visibility": { "field": "event_category", "equals": "badminton" },
  "validation": { "min": 1, "max": 3 }
}
```

`answers_json` is the canonical response snapshot. `form_submission_answers` is a query/export-friendly copy with field label snapshots.

### Registration vs payment

A registration exists before payment and moves through a state machine:

```text
draft → awaiting_payment → payment_pending → confirmed
                                  ├────────→ expired
                                  └────────→ cancelled
```

Free events can move directly from `awaiting_payment` to `confirmed`. Paid events require a successful verified provider response. The client must never be allowed to mark a registration as paid.

### PhonePe safety and idempotency

- Create PhonePe orders only on the server.
- Store our own unique `merchant_order_id` and `idempotency_key`.
- Store provider responses for reconciliation, but never store API secrets.
- Accept a webhook once using `payment_webhook_events.payload_hash` / provider event ID.
- Update the order and registration in one database transaction.
- Confirm the registration only after server-side status verification.
- Store refund records separately; never delete the original payment order.

Amounts are integer paise (`25000` means ₹250). This avoids floating-point errors.

## Recommended admin form-builder capabilities

1. Draft a form and reorder fields.
2. Configure required fields, options, validation, and conditional visibility.
3. Preview the form as a participant.
4. Publish a new immutable version.
5. Assign the published version to future event occurrences.
6. Export submissions with PII masking for sensitive fields.
7. Keep an audit log for form, event, payment, refund, and status changes.
