# Marga Run Club

Marga Run Club is a community fitness events website for weekly running, badminton, pickleball, and F1 screening events.

## Structure

```text
ui/       React + Vite frontend
 server/   Node.js API, database schema, and future PhonePe integration
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
- `POST /api/registrations` — create a registration with `eventId`, `name`, `email`, and optional `answers`

Free registrations become `confirmed`. Paid registrations become `awaiting_payment` and will be connected to PhonePe in the next step. PhonePe order creation and webhook verification must stay on the server; gateway credentials must never be exposed in the UI.

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
