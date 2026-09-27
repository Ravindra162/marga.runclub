# Marga Run Club

Marga Run Club is a community fitness events website for weekly running, badminton, pickleball, and F1 screening events.

## Structure

```text
ui/       React + Vite frontend
 server/   Node.js API, database schema, and PhonePe integration
```

## Run locally

Install frontend dependencies once:

```bash
npm --prefix ui install
```

Install server dependencies and configure PostgreSQL:

```bash
npm --prefix server install
cp server/.env.example server/.env
# Edit server/.env and set DATABASE_URL
npm --prefix server run db:setup
```

For local organizer access, set a private `ADMIN_API_KEY` in `server/.env`. Click **Organizer** in the header to open the form builder and registration dashboard. This is intentionally a simple server API-key gate for development; replace it with Supabase Auth or another identity provider before public launch.

Start the API:

```bash
npm run dev:server
```

Start the UI in a second terminal:

```bash
npm run dev:ui
```

Open `http://localhost:5173`.

The UI proxies `/api` requests to the server on port `8787`. Registrations are stored in PostgreSQL. The database design is in `server/db/schema.sql` and is PostgreSQL/Supabase-compatible.

## API

- `GET /api/health` — health check
- `GET /api/events` — list open event occurrences and ticket prices
- `GET /api/events/:eventId/form` — load the published form version for an event
- `POST /api/registrations` — create a registration with `eventId`, `name`, `email`, and optional `answers`
- `POST /api/payments/orders` — create a server-side PhonePe checkout order for a paid registration
- `GET /api/payments/:merchantOrderId/status` — verify an order with PhonePe and update registration state
- `POST /api/payments/webhook` — verify and process an idempotent PhonePe webhook

Organizer endpoints require the `x-admin-key` header and `ADMIN_API_KEY`:

- `GET /api/admin/overview` — registrations, occurrences, capacity, and revenue
- `GET /api/admin/forms` — published form templates and fields
- `POST /api/admin/forms` — create a form template
- `POST /api/admin/forms/:id/publish` — publish an immutable form version
- `POST /api/admin/occurrences` — create a dated event occurrence

Free registrations become `confirmed`. Paid registrations move through `awaiting_payment` → `payment_pending` → `confirmed` only after server-side PhonePe verification. PhonePe credentials are read only from server environment variables and never exposed in the UI.

### PhonePe configuration

The integration follows PhonePe Standard Checkout API v2: OAuth client credentials, `POST /checkout/v2/pay`, order status verification, and signed webhook processing. Start with `PHONEPE_ENV=sandbox`; add the PhonePe client credentials and webhook secret to `server/.env`. Set `PHONEPE_DEMO=true` only for local UI testing without a PhonePe account. Demo mode never marks a payment as paid.

## Database design

The schema supports event series, dated occurrences, customizable Google-Forms-style forms, immutable form versions, participants, registrations, ticket pricing, PhonePe orders, payment attempts, webhooks, refunds, and audit logs.

```bash
psql "$DATABASE_URL" -f server/db/schema.sql
psql "$DATABASE_URL" -f server/db/seed.sql
```

Read `server/db/README.md` before connecting the API to PostgreSQL.

## Build

```bash
npm run build
```

## GitHub

After creating an empty GitHub repository, add its URL and push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git branch -M main
git push -u origin main
```
