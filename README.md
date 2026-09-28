# Marga Run Club

Marga Run Club is a community fitness events website for weekly running, badminton, pickleball, and F1 screening events.

## Structure

```text
ui/       React + Vite frontend
 server/   Node.js API, database schema, and Razorpay integration
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
# Edit server/.env and set DATABASE_URL. Google sign-in is optional locally;
# configure BETTER_AUTH_SECRET and Google OAuth credentials to enable it.
npm --prefix server run db:setup
```

For local organizer access, set a private `ADMIN_API_KEY` in `server/.env`. Click **Organizer** in the header to open the form builder and registration dashboard. Public members can use Google sign-in to open **My registrations** and see their event and payment status.

Start the API:

```bash
npm run dev:server
```

Start the UI in a second terminal:

```bash
npm run dev:ui
```

Open `http://localhost:5173`.

The organizer console is available at `http://localhost:5173/admin` locally or `/admin` on the deployed site. It is intentionally not linked from the public header.

The UI proxies `/api` requests to the server on port `8787`. Registrations are stored in PostgreSQL. The database design is in `server/db/schema.sql` and is PostgreSQL/Supabase-compatible.

## Deploy to Vercel

The repository is configured as a Vercel project: the Vite build serves the UI and `/api/*` routes are handled by the serverless function in `api/[...path].js`.

From the project root:

```bash
npx vercel login
npx vercel
```

Add these environment variables in the Vercel project settings for **Preview** and **Production**:

```text
DATABASE_URL
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
ADMIN_API_KEY
UI_ORIGIN=https://your-project.vercel.app
PUBLIC_APP_URL=https://your-project.vercel.app
AUTH_URL=https://your-project.vercel.app
BETTER_AUTH_SECRET=generate-a-long-random-server-secret
GOOGLE_CLIENT_ID=your-google-web-client-id
GOOGLE_CLIENT_SECRET=your-google-web-client-secret
```

After deployment, set the Razorpay Test Mode webhook URL to:

```text
https://your-project.vercel.app/api/payments/webhook
```

The webhook secret in Razorpay must exactly match `RAZORPAY_WEBHOOK_SECRET` in Vercel. Do not commit `.env.local` or `server/.env`.

### Payment confirmation email

After Razorpay confirms a captured payment server-side, Marga sends one idempotent confirmation email through Gmail SMTP using a Google App Password. Keep `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` server-only. The email includes the participant name, event, date/time, venue, ticket, amount paid, registration code, Razorpay payment ID, and event details link.

The database migration creates `email_deliveries` so duplicate payment verification or webhook delivery does not send duplicate confirmations. Run the setup command once after deploying the schema changes:

```bash
npm --prefix server run db:setup
```

### Google sign-in configuration

In Google Cloud Console, create an OAuth client with application type **Web application**. Add this authorized redirect URI:

```text
https://your-project.vercel.app/api/auth/callback/google
```

For local development, also add:

```text
http://localhost:8787/api/auth/callback/google
```

The browser calls Better Auth at `/api/auth/*`; the Google client secret remains server-side. On first verified sign-in, the server links the Better Auth identity to the existing `app_users` row by email, allowing prior registrations to appear in the member dashboard.

## API

- `GET /api/health` — health check
- `GET /api/events` — list open event occurrences and ticket prices
- `GET /api/events/:eventId/form` — load the published form version for an event
- `POST /api/registrations` — create a registration with `eventId`, `name`, `email`, and optional `answers`
- `POST /api/payments/orders` — create a server-side Razorpay order for a paid registration
- `POST /api/payments/verify` — verify a Razorpay Checkout signature and confirm the registration
- `GET /api/payments/:merchantOrderId/status` — retrieve a Razorpay order status and update registration state
- `POST /api/payments/webhook` — verify and process an idempotent Razorpay webhook
- `GET /api/me` — current signed-in member, if any
- `GET /api/me/registrations` — signed-in member's registrations and payment states

Organizer endpoints require the `x-admin-key` header and `ADMIN_API_KEY`:

- `GET /api/admin/overview` — registrations, occurrences, capacity, and revenue
- `GET /api/admin/forms` — published form templates and fields
- `POST /api/admin/forms` — create a form template
- `POST /api/admin/forms/:id/publish` — publish an immutable form version
- `POST /api/admin/occurrences` — create a dated event occurrence

Free registrations become `confirmed`. Paid registrations move through `awaiting_payment` → `payment_pending` → `confirmed` only after server-side Razorpay signature/status verification. Razorpay credentials are read only from server environment variables and never exposed in the UI.

### Razorpay configuration

Create test keys in the Razorpay Dashboard under **Test Mode → Account & Settings → API Keys**, then add them to `server/.env`:

```env
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=choose-a-separate-webhook-secret
```

The key secret stays server-side. The public key ID is returned only when the server creates an order so the browser can open Razorpay Checkout. Configure the webhook URL as `https://your-domain.example/api/payments/webhook` after deploying behind HTTPS.

## Database design

The schema supports event series, dated occurrences, customizable Google-Forms-style forms, immutable form versions, participants, registrations, ticket pricing, Razorpay orders, payment attempts, webhooks, refunds, and audit logs.

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
