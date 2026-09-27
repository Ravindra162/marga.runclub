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

Start the API:

```bash
npm run dev:server
```

Start the UI in a second terminal:

```bash
npm run dev:ui
```

Open `http://localhost:5173`.

The UI proxies `/api` requests to the server on port `8787`. Registrations are stored locally in `server/data/registrations.json` during development. The production database design is in `server/db/schema.sql` and is PostgreSQL/Supabase-compatible.

## API

- `GET /api/health` — health check
- `POST /api/registrations` — create a registration with `eventId`, `name`, and `email`

The registration status starts as `pending`. PhonePe order creation and webhook verification should be added to the server only; gateway credentials must never be exposed in the UI.

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
