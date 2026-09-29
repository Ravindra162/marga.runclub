# Marga Run Club — Current Progress Snapshot

> Handoff document for seamless future development. This snapshot intentionally contains no credentials or secret values.

## Project

Marga Run Club is a React/Vite event-registration website with a Node.js API, Neon PostgreSQL storage, dynamic registration forms, organizer tools, and Razorpay Standard Checkout payments.

Working directory:

```text
/home/ravindra162/Desktop/vibe/marga-run-club
```

Production URL:

```text
https://marga-run-club.vercel.app
```

Latest production deployment at the time of this snapshot:

```text
https://marga-run-club-3hyezex18-ravindras-projects-e3517ca0.vercel.app
```

The production alias is the important URL; the deployment-specific URL is included only for traceability.

## Current objective/status

The application is deployed and operational. The latest local `main` commits extend the registration and delivery pipeline. The latest completed work addressed:

- Dynamic event occurrences and event-series management
- Dynamic Google-Forms-style registration forms
- Immutable form versions
- Form option editing for dropdown, radio, multi-select, and checkbox fields
- Organizer forms library with edit/version and archive actions
- Event-to-form assignment
- Event occurrence editing
- Ticket name, description, capacity, and rupee pricing
- Split organizer dashboard with fixed desktop navigation
- Razorpay server-side order creation and payment verification
- Razorpay status reconciliation after successful checkout
- Razorpay webhook verification and idempotent webhook processing
- Vercel deployment through one serverless API function
- Better Auth Google sign-in with Neon-backed sessions
- Member dashboard for authenticated users' registrations and payment state
- Google G logo on the public sign-in control
- Public header no longer exposes the Organizer link
- Organizer console moved to `/admin`
- Only confirmed registrations consume event capacity
- Failed/cancelled/pending payments do not consume event capacity
- Atomic capacity check during successful payment confirmation
- Global text selection disabled except in inputs, textareas, selects, and registration codes
- Payment confirmation emails through Gmail SMTP, with idempotent delivery tracking
- Multi-ticket registration with a quantity stepper and per-attendee details
- Profile editing for signed-in members, including persisted mobile numbers
- Stronger profile and additional-attendee validation on both client and server
- Retry after failed, cancelled, or expired payment attempts without leaving the participant permanently blocked

Google sign-in and the member registration dashboard are implemented and deployed. Signed-in members can edit their profile and registration supports multiple tickets/attendees. Organizer access still uses the existing `ADMIN_API_KEY` gate and has not yet migrated to organization-role authorization.

## Architecture

```text
ui/                         React + Vite frontend
ui/src/App.jsx              Main public app and organizer entry point
ui/src/components/          Public event UI, registration modal, member and organizer dashboards
ui/src/styles.css           Public and organizer dashboard styles
server/src/index.js         API router and Vercel handler
server/src/admin.js         Organizer queries and mutations
server/src/razorpay.js      Razorpay API calls and signature verification
server/src/db.js            Neon/PostgreSQL pool and transactions
server/src/env.js           Local dotenv loading; Vercel uses injected env vars
server/db/schema.sql        PostgreSQL schema
server/src/db-setup.js      Idempotent setup/migration/seed helper
api/index.js                Single Vercel serverless function entrypoint
vercel.json                 Build output and API/SPA rewrites
```

Vercel intentionally uses one function to remain within the Hobby plan function limit. `vercel.json` rewrites `/api/:path*` to `/api/index` before falling back to the SPA `index.html`.

## Local development

From the project root:

```bash
npm install
npm run dev
```

The root `dev` script starts the API and UI together. Separate commands are also available:

```bash
npm run dev:server
npm run dev:ui
```

The API runs on port `8787`; Vite runs on port `5173` and proxies `/api` requests to the API.

Environment setup:

```bash
cp server/.env.example server/.env
# Set DATABASE_URL and the local Razorpay/admin values
npm --prefix server run db:setup
```

Do not print or commit `server/.env`, `.env.local`, database URLs, Razorpay secrets, webhook secrets, or the admin key.

## Environment variables

Required in Vercel Preview/Production:

```text
DATABASE_URL
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
ADMIN_API_KEY
UI_ORIGIN
PUBLIC_APP_URL
AUTH_URL
BETTER_AUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `DATABASE_URL`, and `ADMIN_API_KEY` are server-only. The Razorpay public key ID is returned only as part of server-created checkout order data.

Google Cloud OAuth redirect URIs:

```text
http://localhost:8787/api/auth/callback/google
https://marga-run-club.vercel.app/api/auth/callback/google
```

`AUTH_URL` is the API origin (`http://localhost:8787` locally and the production site on Vercel). `BETTER_AUTH_SECRET` must be a long random server-only value.

Razorpay webhook URL:

```text
https://marga-run-club.vercel.app/api/payments/webhook
```

## Organizer dashboard

Open `/admin` on the site and enter the configured `ADMIN_API_KEY`.

The dashboard is split into four views:

### Overview

- Upcoming event count
- Registration count
- Published form count
- Event-series count
- Upcoming event list
- Recent registrations
- Shortcuts to Events, Forms, and Registrations

### Events

- Schedule an occurrence
- Create an event series/type
- View **Active events** separately from **Past and closed** events
- Edit each occurrence using the visible **Edit** button
- Change event title, series, date/time, capacity, assigned form, ticket name, ticket description, and price
- Price is entered in rupees and converted to paise server-side
- Desktop sidebar is fixed to the viewport; mobile uses a compact top navigation

### Forms

- Create a reusable form template
- Edit a form by publishing a new immutable version
- Archive a form template without destroying submissions/history
- Add/remove/reorder conceptually through the field builder
- Choice fields expose an inline options editor:
  - Dropdown
  - Multiple choice/radio
  - Multi-select
  - Checkboxes
- Server rejects choice fields with no non-empty options

### Registrations

- Shows latest participant registrations
- Shows event, email, status, and amount

Important form-version behavior: existing occurrences retain their assigned historical version. Publishing a new form version affects future assignments, not existing submissions.

## Organizer API routes

All organizer routes require:

```http
x-admin-key: <ADMIN_API_KEY>
```

Current routes:

```text
GET    /api/admin/overview
GET    /api/admin/forms
POST   /api/admin/events
POST   /api/admin/forms
PATCH  /api/admin/forms/:id
DELETE /api/admin/forms/:id       # archives; does not hard-delete history
POST   /api/admin/forms/:id/publish
POST   /api/admin/occurrences
PATCH  /api/admin/occurrences/:id
```

The occurrence update route changes the scheduled occurrence and its active ticket. It can also update the event-series title when the edit payload includes `title`.

## Public API routes

```text
GET  /api/health
GET  /api/events
GET  /api/events/:eventId/form
POST /api/registrations
POST /api/payments/orders
POST /api/payments/verify
GET  /api/payments/:merchantOrderId/status
POST /api/payments/webhook
GET  /api/me
GET  /api/me/registrations
PATCH /api/me
POST /api/auth/sign-in/social
POST /api/auth/sign-out
```

## Payment flow

Paid registration flow:

```text
POST /api/registrations
  registration status: awaiting_payment

POST /api/payments/orders
  creates Razorpay order server-side
  registration status: payment_pending

Razorpay Checkout in browser

POST /api/payments/verify
  validates HMAC signature
  validates Razorpay payment/order/amount
  confirms the registration only if confirmed capacity remains

GET /api/payments/:merchantOrderId/status
  retrieves Razorpay order state
  reconciles local payment/registration state

POST /api/payments/webhook
  validates Razorpay webhook signature
  handles captured/paid/failed events idempotently
```

Registration details:

- A registration accepts `quantity` from 1 through 10.
- Paid totals are calculated server-side as ticket price multiplied by quantity.
- Additional attendees are stored with the form submission and require a valid name; an optional email must contain `@`.
- Capacity counts confirmed ticket quantities, not just registration rows.
- If an earlier registration for the same participant/event is awaiting payment or payment-pending and its payment is failed, cancelled, expired, or past its expiry time, it is cancelled and a new registration can be created.
- Existing active registrations still prevent duplicate registration for the same participant and event.

The latest payment fix added:

- Existing pending local orders are checked against Razorpay before being reused.
- A Razorpay order already reported as paid is reconciled immediately.
- Browser verification retries several times after Checkout success.
- Browser verification falls back to the order-status endpoint if capture propagation is delayed.
- Payment verification checks order ID and amount before accepting capture status.
- Pending registrations are not included in capacity counts.
- Only `confirmed` registrations count toward event capacity.
- Successful payment confirmation locks the occurrence and rechecks capacity atomically.
- If an event fills before a captured payment can be confirmed, the registration is marked `expired` and the response instructs organizers to handle the refund.

Payment statuses:

```text
Registration: awaiting_payment → payment_pending → confirmed
                         └──────────────→ awaiting_payment/expired when payment fails or capacity is unavailable
Payment order: created/pending → paid
```

Do not confirm a registration merely because the Razorpay modal closed. Confirmation must come from server-side signature/order/payment validation or trusted webhook/status reconciliation.

## Production diagnosis already performed

The reported issue was:

```text
Razorpay payment succeeded, but registration remained payment_pending.
```

Production inspection showed one order where:

```text
Razorpay order state: paid
Local payment order: pending
Local registration: payment_pending
```

Calling the existing production status endpoint changed it correctly to:

```text
payment order: paid
registration: confirmed
```

Another older order was still genuinely `created` at Razorpay, so it was correctly not auto-confirmed.

Do not manually mark future registrations confirmed without checking the Razorpay order/payment state.

## Validation

Run these from the project root:

```bash
npm run build
node --check server/src/index.js
node --check server/src/admin.js
node --check server/src/razorpay.js
git diff --check
```

Production smoke checks:

```bash
curl https://marga-run-club.vercel.app/api/health
```

Expected health shape:

```json
{
  "ok": true,
  "database": "postgres",
  "razorpay": true,
  "service": "marga-run-club-server"
}
```

Admin overview requires the local/private admin key and should be queried without printing the key.

## Deployment

Deploy from the project root:

```bash
npx vercel --prod --yes
```

The deployment should finish with the production alias:

```text
https://marga-run-club.vercel.app
```

After deployment, verify:

1. `/api/health` returns healthy JSON.
2. The public event list loads.
3. Google sign-in returns a Google authorization redirect.
4. `/admin` loads the organizer access screen and the public header does not show Organizer.
5. Organizer access returns the overview with the configured key.
6. A paid Test Mode registration reaches Razorpay Checkout.
7. A successful payment becomes `confirmed` after verification/reconciliation.
8. Razorpay webhook delivery is configured for the production URL.

## Current worktree state

The latest local commits are:

```text
4fff04b Add GitHub Actions CI pipeline
5757bd3 Allow retry after cancelled payments
432f6e8 Harden profile and attendee validation
90af53f Add profile editing and attendee detail groups
63f08fe Add ticket quantity stepper
36c5f7e Add running loader for event loading
dab517a Send payment confirmations through Gmail SMTP
```

`4fff04b` is ahead of `origin/main`; the remote tip observed during this update is `5757bd3`. The current worktree contains the uncommitted documentation cleanup described above. The production alias should be treated as deployed from the last explicitly deployed revision, not automatically assumed to include these newest local commits. Do not reset or discard future user changes.

The current change set includes the original event/forms/Razorpay/Vercel work plus the latest organizer dashboard and payment reconciliation work. There is no requirement to commit or push this snapshot.

Typical modified/new paths include:

```text
server/src/admin.js
server/src/index.js
server/src/razorpay.js
server/src/env.js
server/db/schema.sql
server/src/db-setup.js
ui/src/components/AdminDashboard.jsx
ui/src/components/RegistrationModal.jsx
ui/src/styles.css
api/index.js
vercel.json
package.json
package-lock.json
```

## Known limitations and next work

1. **Organizer authentication** is still a shared API-key gate. Replace it with real user authentication and role-based permissions before public organizer use.
2. **Payment reconciliation monitoring** is not yet automated. Add a scheduled reconciliation job for stale `payment_pending` orders.
3. **Refund/cancellation workflows** need organizer UI and Razorpay refund integration.
4. **Webhook delivery** should be confirmed in Razorpay Test Mode and production monitoring should be added.
5. **Email confirmations** require production Gmail SMTP credentials and a one-time database setup migration; delivery tracking and payment-confirmation email content are implemented.
6. **Backups, retention, audit logs, and operational alerts** should be formalized before launch.
7. The root README has some older deployment wording referring to `api/[...path].js`; the actual current Vercel entrypoint is `api/index.js` and `vercel.json` routes to `/api/index`.
8. There is no committed automated test suite covering the full Razorpay callback/webhook lifecycle; add a red-capable integration test around payment reconciliation when the project is ready for test infrastructure.
9. **Multi-ticket attendee identity** is currently captured in the submission JSON; decide whether attendees need first-class records, per-attendee ticket identities, or check-in support before expanding the event operations workflow.
10. **Latest local changes are not all deployed/pushed.** Build and smoke-test the registration quantity, profile editing, and retry changes before promoting them to production.

## Safe next-session startup checklist

1. Read this file before modifying the project.
2. Inspect `git status --short`; preserve existing uncommitted work.
3. Run `npm run build` before and after changes.
4. For payment work, inspect local payment order state and Razorpay provider state before changing confirmation logic.
5. Keep all secrets redacted in logs, terminal output, and documentation.
6. Test the affected API route locally before deploying.
7. Use `npx vercel --prod --yes` only when the user asks for deployment.
8. Do not commit or push unless explicitly requested.
